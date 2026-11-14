package expo.modules.callaudio

import android.app.NotificationManager
import android.content.Context
import android.media.*
import android.os.*
import android.util.Log

/** One looping player. Incoming playback is owned by CallService, outgoing by the JS call state. */
internal object CallTonePlayer {
  private val main = Handler(Looper.getMainLooper())
  private var key: String? = null
  private var id = ""
  private var deadline = 0L
  private var player: MediaPlayer? = null
  private var audio: AudioManager? = null
  private var focus: AudioFocusRequest? = null
  private var ready = false
  private var focused = false
  private val expire = Runnable { release() }

  fun startIncoming(context: Context, callId: String, expires: Long) {
    val manager = context.getSystemService(AudioManager::class.java)
    val notifications = context.getSystemService(NotificationManager::class.java)
    val filter = notifications.currentInterruptionFilter
    if (!notifications.areNotificationsEnabled() ||
      notifications.getNotificationChannel(CallIncomingNotification.CHANNEL)?.importance == NotificationManager.IMPORTANCE_NONE) {
      Log.i("PulseCallPush", "callId=$callId stage=notification-blocked")
      return
    }
    if (
      manager.ringerMode != AudioManager.RINGER_MODE_NORMAL ||
        filter == NotificationManager.INTERRUPTION_FILTER_NONE ||
        filter == NotificationManager.INTERRUPTION_FILTER_ALARMS
    )
      return
    play(context, "incoming:" + callId, callId, true, expires)
  }

  fun start(context: Context, toneKey: String, uuid: String, sound: String, expires: Long) {
    if (sound == "outgoing") main.post { play(context, toneKey, uuid, false, expires) }
  }

  private fun play(
    context: Context,
    toneKey: String,
    callId: String,
    incoming: Boolean,
    expires: Long,
  ) {
    if (expires <= System.currentTimeMillis()) return
    if (key == toneKey && player != null) {
      id = callId
      deadline = expires
      main.removeCallbacks(expire)
      main.postDelayed(expire, expires - System.currentTimeMillis())
      return
    }
    release()
    key = toneKey
    id = callId
    deadline = expires
    val manager = context.getSystemService(AudioManager::class.java)
    val attributes =
      AudioAttributes.Builder()
        .setUsage(
          if (incoming) AudioAttributes.USAGE_NOTIFICATION_RINGTONE
          else AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING
        )
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()
    val tone = MediaPlayer()
    player = tone
    audio = manager
    try {
      val request =
        AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
          .setAudioAttributes(attributes)
          .setOnAudioFocusChangeListener(
            { change ->
              if (player === tone)
                when (change) {
                  AudioManager.AUDIOFOCUS_GAIN -> {
                    focused = true
                    resume(tone)
                  }
                  AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                    focused = false
                    if (ready && tone.isPlaying) tone.pause()
                  }
                  AudioManager.AUDIOFOCUS_LOSS -> {
                    release()
                    if (incoming) CallService.retryRingtone(callId)
                  }
                }
            },
            main,
          )
          .build()
      focus = request
      check(manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        "Android no ha concedido el foco del timbre."
      }
      focused = true
      tone.setAudioAttributes(attributes)
      tone.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
      tone.isLooping = true
      tone.setVolume(if (incoming) 1f else .3f, if (incoming) 1f else .3f)
      tone.setOnPreparedListener {
        if (player === it) {
          ready = true
          resume(it)
        }
      }
      tone.setOnErrorListener { failed, what, extra ->
        Log.w("PulseCallAudio", "Ringtone playback error: " + what + "/" + extra)
        if (player === failed) {
          release()
          if (incoming) CallService.retryRingtone(callId)
        }
        true
      }
      context.resources
        .openRawResourceFd(
          if (incoming) R.raw.messinger_incoming_call else R.raw.messinger_outgoing_call
        )
        .use { tone.setDataSource(it.fileDescriptor, it.startOffset, it.length) }
      main.postDelayed(expire, (expires - System.currentTimeMillis()).coerceAtLeast(1))
      tone.prepareAsync()
    } catch (error: Exception) {
      release()
      Log.w("PulseCallAudio", "Unable to start ringtone", error)
      if (incoming) CallService.retryRingtone(callId)
    }
  }

  private fun resume(tone: MediaPlayer) {
    if (player === tone && ready && focused) {
      if (System.currentTimeMillis() < deadline) {
        val callId = id
        val incoming = key?.startsWith("incoming:") == true
        try {
          tone.start()
          if (incoming) CallService.ringtoneStarted(callId)
        } catch (error: Exception) {
          release()
          Log.w("PulseCallPush", "callId=$callId stage=ringtone-start-failed error=${error.javaClass.simpleName}")
          if (incoming) CallService.retryRingtone(callId)
        }
      } else release()
    }
  }

  fun stopIncoming(callId: String) {
    if (id == callId && key?.startsWith("incoming:") == true) release()
  }

  fun stopCall(callId: String) {
    if (id == callId) release()
  }

  fun stop(toneKey: String) {
    main.post { if (key == toneKey) release() }
  }

  fun stopBeforeMedia() = release()

  private fun release() {
    main.removeCallbacks(expire)
    val old = player
    player = null
    key = null
    ready = false
    focused = false
    old?.release()
    focus?.let { audio?.abandonAudioFocusRequest(it) }
    focus = null
    audio = null
  }
}
