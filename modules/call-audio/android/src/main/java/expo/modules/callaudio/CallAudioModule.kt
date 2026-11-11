package expo.modules.callaudio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Telecom remains the sole owner of communication audio routing. */
class CallAudioModule : Module() {
  private var proximityLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("MessingerCallAudio")

    OnCreate {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        appContext.reactContext?.let { CallTonePlayer.initialize(it.applicationContext) }
      }
    }

    Function("startCallTone") { key: String, callId: String, sound: String, expiresAt: Double ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function
      appContext.reactContext?.let {
        CallTonePlayer.start(it.applicationContext, key, callId, sound, expiresAt.toLong())
      }
    }

    Function("stopCallTone") { key: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return@Function
      CallTonePlayer.stop(key)
    }

    AsyncFunction("stopCallToneBeforeMedia") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        CallTonePlayer.stopBeforeMedia()
      }
      Unit
    }.runOnQueue(Queues.MAIN)

    Function("getBuiltinOutputs") {
      val context = appContext.reactContext ?: return@Function mapOf("earpiece" to false, "speaker" to false)
      val manager = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val outputs = manager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      mapOf(
        "earpiece" to outputs.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE },
        "speaker" to outputs.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
      )
    }

    Function("setProximityEnabled") { enabled: Boolean ->
      val context = appContext.reactContext ?: return@Function
      val manager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (enabled && manager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
        if (proximityLock == null) {
          proximityLock = manager.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "Messinger:CallProximity")
          proximityLock?.setReferenceCounted(false)
        }
        if (proximityLock?.isHeld != true) proximityLock?.acquire()
      } else {
        releaseProximity()
      }
    }

    OnDestroy { releaseProximity() }
  }

  private fun releaseProximity() {
    if (proximityLock?.isHeld == true) {
      proximityLock?.release(PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY)
    }
    proximityLock = null
  }
}
