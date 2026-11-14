package expo.modules.callaudio

import android.content.Context
import android.media.*
import android.os.*

/** Communication audio starts only after the user accepts and microphone permission is granted. */
internal object CallAudioRoutes {
  private var audio: AudioManager? = null
  private var callId: String? = null
  private var previousMode = AudioManager.MODE_NORMAL
  private var focus: AudioFocusRequest? = null
  val observers = java.util.concurrent.ConcurrentHashMap<String, () -> Unit>()
  private var proximity: PowerManager.WakeLock? = null

  private fun changed() {
    observers.values.forEach { listener ->
      runCatching { listener() }
        .onFailure {
          android.util.Log.w("PulseCallAudio", "Audio observer is no longer available", it)
        }
    }
  }

  fun isActive(id: String) = callId == id && audio != null

  private val main = Handler(Looper.getMainLooper())
  private val devices =
    object : AudioDeviceCallback() {
      override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) {
        changed()
      }

      override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) {
        changed()
      }
    }

  fun start(context: Context, id: String, video: Boolean) {
    if (callId == id) return
    callId?.let { stop(it) }
    val manager = context.getSystemService(AudioManager::class.java)
    previousMode = manager.mode
    audio = manager
    callId = id
    manager.mode = AudioManager.MODE_IN_COMMUNICATION
    val request =
      AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
            .build()
        )
        .build()
    focus = request
    check(manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
      "Android no ha concedido el audio de comunicación."
    }
    manager.registerAudioDeviceCallback(devices, main)
    val routes = routes()
    val external =
      routes.firstOrNull {
        it["selected"] == true && (it["type"] == "Bluetooth" || it["type"] == "Headset")
      } ?: routes.firstOrNull { it["type"] == "Bluetooth" || it["type"] == "Headset" }
    select(
      external?.get("type") as? String
        ?: if (video || routes.none { it["type"] == "Phone" }) "Speaker" else "Phone"
    )
  }

  private fun type(device: AudioDeviceInfo): String? =
    when (device.type) {
      AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
      AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Phone"
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET -> "Bluetooth"
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_USB_HEADSET -> "Headset"
      else -> null
    }

  private fun available(manager: AudioManager): List<AudioDeviceInfo> =
    try {
      if (Build.VERSION.SDK_INT >= 31) manager.availableCommunicationDevices
      else manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).toList()
    } catch (_: SecurityException) {
      manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter {
        type(it) == "Speaker" || type(it) == "Phone"
      }
    }

  fun routes(): List<Map<String, Any>> {
    val manager = audio ?: return emptyList()
    val selected =
      if (Build.VERSION.SDK_INT >= 31) manager.communicationDevice?.let { type(it) }
      else if (manager.isBluetoothScoOn) "Bluetooth"
      else if (manager.isSpeakerphoneOn) "Speaker"
      else if (manager.isWiredHeadsetOn) "Headset" else "Phone"
    return available(manager)
      .mapNotNull { device ->
        type(device)?.let { route ->
          mapOf(
            "name" to device.productName.toString(),
            "type" to route,
            "selected" to (route == selected),
          )
        }
      }
      .distinctBy { it["type"] }
  }

  fun select(route: String) {
    val manager = audio ?: return
    if (Build.VERSION.SDK_INT >= 31) {
      val device = available(manager).firstOrNull { type(it) == route } ?: return
      check(manager.setCommunicationDevice(device)) { "No se pudo cambiar la salida de audio." }
    } else {
      manager.isSpeakerphoneOn = route == "Speaker"
      if (route == "Bluetooth") {
        manager.startBluetoothSco()
        manager.isBluetoothScoOn = true
      } else if (manager.isBluetoothScoOn) {
        manager.stopBluetoothSco()
        manager.isBluetoothScoOn = false
      }
    }
    changed()
  }

  fun stop(id: String) {
    if (callId != id) return
    val manager = audio
    callId = null
    audio = null
    if (proximity?.isHeld == true)
      proximity?.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY)
    proximity = null
    manager?.unregisterAudioDeviceCallback(devices)
    if (Build.VERSION.SDK_INT >= 31) manager?.clearCommunicationDevice()
    else if (manager?.isBluetoothScoOn == true) {
      manager.stopBluetoothSco()
      manager.isBluetoothScoOn = false
    }
    focus?.let { manager?.abandonAudioFocusRequest(it) }
    focus = null
    manager?.mode = previousMode
    changed()
  }

  fun setProximity(context: Context, enabled: Boolean) {
    if (!enabled) {
      if (proximity?.isHeld == true)
        proximity?.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY)
      proximity = null
      return
    }
    if (callId == null) return
    val manager = context.getSystemService(PowerManager::class.java)
    if (manager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
      if (proximity == null)
        proximity =
          manager.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "pulse:proximity")
      if (proximity?.isHeld != true) proximity?.acquire()
    }
  }
}
