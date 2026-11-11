package expo.modules.callaudio

import android.app.NotificationManager
import android.annotation.TargetApi
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import android.util.Log
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import java.util.Locale

/** A process-wide player, independent of React views, JS timers and headless-task completion.
 * CallKeep's phoneCall foreground service keeps the incoming connection alive while ringing.
 * All mutable state and MediaPlayer operations run on Android's main thread.
 */
@TargetApi(26)
internal object CallTonePlayer {
  private const val TAG = "MessingerCallTone"
  private val main = Handler(Looper.getMainLooper())
  private var registered = false
  private var key: String? = null
  private var callId = ""
  private var incoming = false
  private var expiresAt = 0L
  private var blocked = false
  private var player: MediaPlayer? = null
  private var audio: AudioManager? = null
  private var focus: AudioFocusRequest? = null
  private val authorized = linkedSetOf<String>()
  private val stopped = linkedSetOf<String>()
  private val expire = Runnable { silence() }

  // These are the local broadcast actions exposed by react-native-callkeep 4.6.1.
  private val receiver = object : BroadcastReceiver() {
    @Suppress("DEPRECATION")
    override fun onReceive(context: Context, intent: Intent) {
      val attributes = intent.getSerializableExtra("attributeMap") as? HashMap<*, *> ?: return
      val id = (attributes["EXTRA_CALL_UUID"] as? String)?.lowercase(Locale.ROOT) ?: return
      if (intent.action == "ACTION_SHOW_INCOMING_CALL_UI") {
        remember(authorized, id)
        if (incoming && callId == id) play(context)
      } else {
        remember(stopped, id)
        if (callId == id) silence()
      }
    }
  }

  fun initialize(context: Context) {
    main.post {
      if (!registered) {
        val filter = IntentFilter().apply {
          addAction("ACTION_SHOW_INCOMING_CALL_UI")
          addAction("ACTION_ANSWER_CALL")
          addAction("ACTION_END_CALL")
          addAction("ACTION_ON_SILENCE_INCOMING_CALL")
          addAction("ACTION_ON_CREATE_CONNECTION_FAILED")
          addAction("ACTION_ON_CREATE_OUTGOING_CONNECTION_FAILED")
        }
        LocalBroadcastManager.getInstance(context).registerReceiver(receiver, filter)
        registered = true
      }
    }
  }

  fun start(context: Context, toneKey: String, uuid: String, sound: String, deadline: Long) {
    initialize(context)
    main.post {
      if (sound != "incoming" && sound != "outgoing") return@post
      if (key != toneKey) {
        silence()
        key = toneKey
        blocked = false
        incoming = sound == "incoming"
      }
      callId = uuid.lowercase(Locale.ROOT)
      expiresAt = deadline
      main.removeCallbacks(expire)
      val remaining = deadline - System.currentTimeMillis()
      if (remaining <= 0 || stopped.contains(callId)) {
        silence()
        return@post
      }
      // The expiry remains native even if Android suspends JavaScript.
      main.postDelayed(expire, remaining.coerceAtMost(120_000L))
      if (!incoming || authorized.contains(callId)) play(context)
    }
  }

  fun stop(toneKey: String) {
    main.post { if (key == toneKey) silence() }
  }

  // Called by an Expo AsyncFunction on Queues.MAIN, awaited before getUserMedia.
  fun stopBeforeMedia() = silence()

  private fun play(context: Context) {
    if (blocked || player != null) return
    if (System.currentTimeMillis() >= expiresAt) {
      silence()
      return
    }
    val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    if (incoming) {
      val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      // Respect the device's silent/vibrate mode and DND call policy.
      if (manager.ringerMode != AudioManager.RINGER_MODE_NORMAL ||
        manager.getStreamVolume(AudioManager.STREAM_RING) == 0 ||
        notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_NONE ||
        notifications.currentInterruptionFilter == NotificationManager.INTERRUPTION_FILTER_ALARMS) return
    }
    val attributes = AudioAttributes.Builder()
      .setUsage(if (incoming) AudioAttributes.USAGE_NOTIFICATION_RINGTONE else AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
      .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
      .build()
    val ringtone = MediaPlayer()
    player = ringtone
    audio = manager
    try {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
        .setAudioAttributes(attributes)
        .setOnAudioFocusChangeListener({ change ->
          if (change == AudioManager.AUDIOFOCUS_LOSS && player === ringtone) silence()
        }, main)
        .build()
      focus = request
      if (manager.requestAudioFocus(request) != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
        silence()
        Log.w(TAG, "Tone audio focus denied")
        return
      }
      ringtone.setAudioAttributes(attributes)
      ringtone.setWakeMode(context, PowerManager.PARTIAL_WAKE_LOCK)
      ringtone.isLooping = true
      val volume = if (incoming) 0.6f else 0.3f
      ringtone.setVolume(volume, volume)
      ringtone.setOnPreparedListener {
        if (player === it && !blocked) {
          if (System.currentTimeMillis() < expiresAt) {
            it.start()
            Log.d(TAG, if (incoming) "Incoming ringtone started" else "Outgoing ringback started")
          } else silence()
        }
      }
      ringtone.setOnErrorListener { failed, what, extra ->
        Log.w(TAG, "Tone playback failed ($what, $extra)")
        if (player === failed) silence()
        true
      }
      val resource = if (incoming) R.raw.messinger_incoming_call else R.raw.messinger_outgoing_call
      context.resources.openRawResourceFd(resource).use {
        ringtone.setDataSource(it.fileDescriptor, it.startOffset, it.length)
      }
      ringtone.prepareAsync()
    } catch (error: Exception) {
      silence()
      Log.w(TAG, "Unable to prepare call tone", error)
    }
  }

  private fun silence() {
    blocked = true
    main.removeCallbacks(expire)
    val previous = player
    player = null
    // release() also cancels asynchronous preparation and releases the playback wake lock.
    previous?.release()
    focus?.let { audio?.abandonAudioFocusRequest(it) }
    focus = null
    audio = null
  }

  private fun remember(values: MutableSet<String>, id: String) {
    values.add(id)
    if (values.size > 64) values.remove(values.first())
  }
}
