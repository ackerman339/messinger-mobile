package expo.modules.callaudio

import android.content.Context
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.functions.Coroutine
import android.app.Application
import android.app.NotificationManager
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** Telecom remains the sole owner of communication audio routing. */
class CallAudioModule : Module() {
  private var proximityLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("MessingerCallAudio")

    Function("canUseFullScreenCalls") {
      val context = appContext.reactContext
      Build.VERSION.SDK_INT < 34 || (context?.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager)?.canUseFullScreenIntent() == true
    }
    Function("openFullScreenCallSettings") {
      appContext.reactContext?.let { context ->
        if (Build.VERSION.SDK_INT >= 34) context.startActivity(
          Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      Unit
    }

    OnCreate {
      (appContext.reactContext?.applicationContext as? Application)?.let { CallWindowState.initialize(it) }
      appContext.currentActivity?.let { CallWindowState.attach(it) }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        appContext.reactContext?.let { CallTonePlayer.initialize(it.applicationContext) }
      }
    }

    AsyncFunction("startCallMedia") Coroutine { id: String ->
      val context = appContext.reactContext?.applicationContext ?: error("Android no está disponible.")
      CallMediaSession.start(context, id)
    }
    Function("stopCallMedia") { id: String -> CallMediaSession.stop(id) }
    Function("finishCallPresentation") { id: String ->
      CallMediaSession.stop(id)
      CallWindowState.finish(id)
      appContext.reactContext?.let { CallIncomingNotification.dismiss(it, id) }
    }
    AsyncFunction("presentIncomingCall") Coroutine { id: String, caller: String, media: String, name: String, expires: Double ->
      val context = appContext.reactContext?.applicationContext ?: error("Android no está disponible.")
      CallIncomingNotification.present(context, id, caller, media, name, expires.toLong())
    }
    Function("prepareIncomingCall") { id: String, caller: String, media: String, name: String, expires: Double ->
      appContext.reactContext?.applicationContext?.let { context ->
        CallIncomingNotification.prepare(id, caller, media, name, expires.toLong())
        CallTonePlayer.initialize(context)
      }
    }
    Function("dismissIncomingCall") { id: String ->
      appContext.reactContext?.let { CallIncomingNotification.dismiss(it, id) }
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
