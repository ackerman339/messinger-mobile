package expo.modules.callaudio

import android.Manifest
import android.app.Notification
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.*

/**
 * One Android owner for an incoming alert and the foreground microphone session after acceptance.
 */
class CallService : Service() {
  @Volatile
  internal var call: CallInfo? = null
    private set

  private enum class Phase {
    RINGING,
    CONNECTING,
    ACTIVE,
  }

  private var phase = Phase.RINGING
  private var owner: String? = null
  private var silenced = false
  private var fullScreen = false
  private var ringtoneAttempts = 0
  private var cpu: PowerManager.WakeLock? = null
  private val main = Handler(Looper.getMainLooper())
  private val expire = Runnable { end() }
  private val retryRing = Runnable {
    val data = call
    if (
      data != null &&
        phase == Phase.RINGING &&
        !silenced &&
        data.deadline > System.currentTimeMillis()
    )
      CallTonePlayer.startIncoming(this, data.id, data.deadline)
  }

  override fun onBind(intent: Intent?) = null

  override fun onCreate() {
    super.onCreate()
    running = this
    CallWindowState.initialize(application)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    val data = CallInfo.from(intent)
    if (
      intent.getIntExtra("epoch", epoch) != epoch ||
        data.id.isBlank() ||
        (intent.hasExtra("sessionUser") && intent.getStringExtra("sessionUser") != CallPushSession.user(this)) ||
        closed.contains(data.id) ||
        (intent.action == INCOMING && data.deadline <= System.currentTimeMillis())
    ) {
      if (call == null) stopSelf()
      return START_NOT_STICKY
    }
    if (
      call != null &&
        call?.id != data.id &&
        !(intent.action == OUTGOING &&
          call?.id?.startsWith("outgoing:") == true &&
          phase == Phase.CONNECTING)
    )
      return START_NOT_STICKY
    if (intent.action == INCOMING) {
      if (call == data || (call != null && phase != Phase.RINGING)) return START_NOT_STICKY
      val first = call == null
      if (first) {
        phase = Phase.RINGING
        owner = null
        silenced = false
        ringtoneAttempts = 0
        fullScreen = intent.getBooleanExtra("screenOff", !getSystemService(PowerManager::class.java).isInteractive)
      }
      call = data
      publish(CallIncomingNotification.incoming(this, data, fullScreen, silenced))
      android.util.Log.i("PulseCallPush", "callId=${data.id} stage=foreground fullScreen=$fullScreen")
      pendingOwners[data.id]?.let {
        answer(data.id, it)
        return START_NOT_STICKY
      }
      if (first) {
        holdCpu(data.deadline - System.currentTimeMillis() + 5000)
      }
      if (!silenced) CallTonePlayer.startIncoming(this, data.id, data.deadline)
      main.removeCallbacks(expire)
      main.postDelayed(expire, (data.deadline - System.currentTimeMillis()).coerceAtLeast(1))
      CallIncomingActivity.refresh()
    } else {
      if (call?.id == data.id) return START_NOT_STICKY
      call = data
      owner = intent.getStringExtra("owner")
      phase = Phase.CONNECTING
      // Outgoing calls start while the activity is visible, before the caller backgrounds it.
      publish(
        CallIncomingNotification.ongoing(this, data),
        microphone =
          checkSelfPermission(Manifest.permission.RECORD_AUDIO) ==
            PackageManager.PERMISSION_GRANTED,
      )
      holdCpu(65_000)
      main.removeCallbacks(expire)
      main.postDelayed(expire, 60_000)
    }
    CallWindowState.refresh()
    return START_NOT_STICKY
  }

  private fun holdCpu(timeout: Long = 0) {
    cpu?.let { if (it.isHeld) it.release() }
    cpu =
      getSystemService(PowerManager::class.java)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "pulse:call")
        .apply {
          setReferenceCounted(false)
          if (timeout > 0) acquire(timeout.coerceAtLeast(1)) else acquire()
        }
  }

  private fun publish(notice: Notification, microphone: Boolean = false) {
    if (Build.VERSION.SDK_INT >= 29)
      startForeground(
        NOTICE_ID,
        notice,
        ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
          (if (microphone) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0),
      )
    else startForeground(NOTICE_ID, notice)
  }

  internal fun answer(id: String, actor: String) {
    if (call?.id != id || phase == Phase.ACTIVE) return
    if (phase == Phase.RINGING && call!!.deadline <= System.currentTimeMillis()) {
      end()
      return
    }
    phase = Phase.CONNECTING
    owner = actor
    CallWindowState.refresh()
    holdCpu(35_000)
    CallTonePlayer.stopIncoming(id)
    CallIncomingActivity.dismiss(id)
    publish(CallIncomingNotification.ongoing(this, call!!))
    main.removeCallbacks(expire)
    main.postDelayed(expire, 30_000)
  }

  internal fun activate(id: String, actor: String, media: String = call?.media ?: "audio") {
    check(call?.id == id) { "La llamada ya no está disponible." }
    if (phase == Phase.ACTIVE && owner == actor && CallAudioRoutes.isActive(id)) return
    check(
      checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
    ) {
      "Permite el micrófono antes de atender."
    }
    owner = actor
    call = call!!.copy(media = media)
    phase = Phase.ACTIVE
    CallTonePlayer.stopBeforeMedia()
    main.removeCallbacks(expire)
    holdCpu()
    val notice = CallIncomingNotification.ongoing(this, call!!)
    publish(notice, microphone = true)
    CallAudioRoutes.start(this, id, call!!.media == "video")
    CallIncomingActivity.dismiss(id)
  }

  private fun end() {
    val ending = call
    call = null
    phase = Phase.RINGING
    owner = null
    silenced = false
    ending?.id?.let {
      pendingOwners.remove(it)
      closed.add(it)
      while (closed.size > 256) closed.remove(closed.first())
      CallTonePlayer.stopCall(it)
      CallIncomingActivity.dismiss(it)
      CallAudioRoutes.stop(it)
    }
    main.removeCallbacks(expire)
    main.removeCallbacks(retryRing)
    cpu?.let { if (it.isHeld) it.release() }
    cpu = null
    stopForeground(STOP_FOREGROUND_REMOVE)
    CallWindowState.refresh()
    stopSelf()
  }

  internal fun owns(id: String, actor: String) = call?.id == id && owner == actor

  override fun onDestroy() {
    if (running === this) {
      end()
      running = null
    }
    super.onDestroy()
  }

  companion object {
    private const val INCOMING = "pulse.INCOMING"
    private const val OUTGOING = "pulse.OUTGOING"
    private const val NOTICE_ID = 7401
    private const val PENDING_ANSWER = "notification-answer"
    private val main = Handler(Looper.getMainLooper())
    private val closed = linkedSetOf<String>()
    private var epoch = 0
    private val pendingOwners = mutableMapOf<String, String>()
    @Volatile
    internal var running: CallService? = null
      private set

    internal fun current() = running?.call

    internal fun incoming(context: Context, data: CallInfo, screenOff: Boolean = !context.getSystemService(PowerManager::class.java).isInteractive, sessionUser: String? = null) {
      if (data.deadline <= System.currentTimeMillis() || closed.contains(data.id)) return
      context.startForegroundService(data.intent(context, INCOMING).putExtra("epoch", epoch).putExtra("screenOff", screenOff).apply {
        if (sessionUser != null) putExtra("sessionUser", sessionUser)
      })
    }

    internal fun outgoing(context: Context, data: CallInfo, actor: String? = null) {
      if (closed.contains(data.id)) return
      context.startForegroundService(
        data.intent(context, OUTGOING).putExtra("epoch", epoch).putExtra("owner", actor)
      )
    }

    fun accept(id: String, actor: String) {
      main.post {
        if (running?.call?.id != null && running?.call?.id != id) return@post
        pendingOwners[id] = actor
        running?.answer(id, actor)
      }
    }

    fun notificationAction(id: String, action: String) {
      // These callbacks originate from a user tap, never from a platform presentation failure.
      val service = running ?: return
      val call = service.call ?: return
      if (call.id != id || service.phase != Phase.RINGING) return
      if (action == "reject") {
        service.end()
      } else if (call.groupConversationId != null) {
        if (call.deadline > System.currentTimeMillis()) CallWindowState.prepareGroupAnswer(id)
        service.end()
      } else {
        service.answer(id, PENDING_ANSWER)
      }
    }

    fun finish(id: String, actor: String, force: Boolean = false) {
      main.post {
        if (force) pendingOwners.remove(id)
        val service = running
        if (service?.call?.id == id && (force || service.owner == null || service.owner == actor))
          service.end()
        else if (
          service?.call?.id != id &&
            (force || pendingOwners[id] == null || pendingOwners[id] == actor)
        )
          closed.add(id)
      }
    }

    fun dismissIncoming(id: String) {
      main.post {
        val service = running
        if (service?.call?.id == id && service.phase == Phase.RINGING) service.end()
        else if (service?.call?.id != id && !pendingOwners.containsKey(id)) closed.add(id)
      }
    }

    fun silence(id: String) {
      main.post {
        val service = running
        if (service?.call?.id == id && service.phase == Phase.RINGING) {
          service.silenced = true
          CallTonePlayer.stopIncoming(id)
          service.publish(CallIncomingNotification.incoming(service, service.call!!, false, true))
        }
      }
    }

    fun clear() {
      main.post {
        epoch++
        pendingOwners.clear()
        CallWindowState.clearGroupAnswer()
        running?.end()
      }
    }

    fun retryRingtone(id: String) {
      val service = running ?: return
      if (
        service.call?.id != id ||
          service.phase != Phase.RINGING ||
          service.silenced
      )
        return
      service.ringtoneAttempts++
      service.main.removeCallbacks(service.retryRing)
      android.util.Log.w("PulseCallPush", "callId=$id stage=ringtone-retry attempt=${service.ringtoneAttempts}")
      service.main.postDelayed(service.retryRing, (200L * service.ringtoneAttempts.coerceAtMost(25)))
    }

    fun ringtoneStarted(id: String) {
      android.util.Log.i("PulseCallPush", "callId=$id stage=ringtone-started")
      running?.takeIf { it.call?.id == id }?.let { it.ringtoneAttempts = 0 }
    }
  }
}
