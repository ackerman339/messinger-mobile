package expo.modules.callaudio

import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.Instant
import java.util.UUID

class CallAudioModule : Module() {
  private val owner = UUID.randomUUID().toString()

  private fun context() =
    appContext.reactContext?.applicationContext ?: error("Android no está disponible.")

  override fun definition() = ModuleDefinition {
    Name("MessingerCallAudio")
    Events("onCallAudioRoutesChanged")
    Function("getCallFlowVersion") { 2 }
    Function("setCallPushUser") { user: String? ->
      val context = context()
      if (CallPushSession.user(context) != user) CallService.clear()
      CallPushSession.set(context, user)
    }
    Function("setCallPanelVisible") { id: String, visible: Boolean ->
      CallWindowState.panel(id, visible)
      Unit
    }
    OnCreate {
      CallAudioRoutes.observers[owner] = {
        sendEvent("onCallAudioRoutesChanged", mapOf("routes" to CallAudioRoutes.routes()))
      }
    }
    OnDestroy { CallAudioRoutes.observers.remove(owner) }

    Function("hasManufacturerCallSettings") {
      Build.MANUFACTURER.lowercase() in listOf("xiaomi", "redmi", "poco")
    }
    Function("openManufacturerCallSettings") {
      val context = context()
      val candidates = listOf(
        Intent("miui.intent.action.APP_PERM_EDITOR")
          .setClassName("com.miui.securitycenter", "com.miui.permcenter.permissions.PermissionsEditorActivity")
          .putExtra("extra_pkgname", context.packageName),
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)),
      )
      var opened = false
      for (intent in candidates) {
        try {
          context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          opened = true
          break
        } catch (_: android.content.ActivityNotFoundException) {
        } catch (_: SecurityException) {
        }
      }
      check(opened) { "Abre Ajustes > Aplicaciones > pulse > Otros permisos." }
    }
    Function("canUseFullScreenCalls") {
      Build.VERSION.SDK_INT < 34 ||
        context()
          .getSystemService(android.app.NotificationManager::class.java)
          .canUseFullScreenIntent()
    }
    Function("openFullScreenCallSettings") {
      if (Build.VERSION.SDK_INT >= 34)
        context()
          .startActivity(
            Intent(
                Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT,
                Uri.parse("package:" + context().packageName),
              )
              .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          )
    }
    AsyncFunction("presentIncomingCall") {
        id: String,
        caller: String,
        media: String,
        name: String,
        expires: Double ->
        CallService.incoming(context(), CallInfo(id, caller, media, name, expires.toLong()))
      }
      .runOnQueue(Queues.MAIN)
    AsyncFunction("presentOutgoingCall") {
        id: String,
        caller: String,
        media: String,
        name: String,
        expires: Double ->
        CallService.outgoing(
          context(),
          CallInfo(id, caller, media, name, expires.toLong(), false),
          owner,
        )
      }
      .runOnQueue(Queues.MAIN)
    Function("getIncomingCall") {
      CallService.current()
        ?.takeIf { it.incoming }
        ?.let {
          mapOf(
            "type" to "call-incoming",
            "callId" to it.id,
            "callerId" to it.caller,
            "media" to it.media,
            "name" to it.name,
            "callerName" to it.name,
            "expiresAt" to Instant.ofEpochMilli(it.deadline).toString(),
          )
        }
    }
    Function("acceptIncomingCall") { id: String -> CallService.accept(id, owner) }
    Function("dismissIncomingCall") { id: String -> CallService.dismissIncoming(id) }
    Function("silenceIncomingCall") { id: String -> CallService.silence(id) }
    Function("finishCallPresentation") { id: String, remote: Boolean ->
      CallService.finish(id, owner, remote)
    }
    Function("clearCalls") { CallService.clear() }

    AsyncFunction("startCallMedia") Coroutine
      { id: String, media: String ->
        CallMediaSession.start(context(), id, media, owner)
      }
    Function("stopCallMedia") { id: String -> CallMediaSession.stop(id, owner) }
    AsyncFunction("getAudioRoutes") {
        val service = CallService.running
        if (service?.call?.id?.let { service.owns(it, owner) } == true) CallAudioRoutes.routes()
        else emptyList<Map<String, Any>>()
      }
      .runOnQueue(Queues.MAIN)
    AsyncFunction("setAudioRoute") { route: String ->
        val service = CallService.running
        check(service?.call?.id?.let { service.owns(it, owner) } == true) {
          "Esta instancia no controla el audio de la llamada."
        }
        CallAudioRoutes.select(route)
      }
      .runOnQueue(Queues.MAIN)
    Function("getBuiltinOutputs") {
      val devices =
        context()
          .getSystemService(AudioManager::class.java)
          .getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      mapOf(
        "speaker" to devices.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER },
        "earpiece" to devices.any { it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE },
      )
    }
    Function("setProximityEnabled") { enabled: Boolean ->
      val context = context()
      android.os.Handler(android.os.Looper.getMainLooper()).post {
        val service = CallService.running
        if (service?.call?.id?.let { service.owns(it, owner) } == true)
          CallAudioRoutes.setProximity(context, enabled)
      }
      Unit
    }
    Function("startCallTone") { key: String, id: String, sound: String, expires: Double ->
      CallTonePlayer.start(context(), key, id, sound, expires.toLong())
    }
    Function("stopCallTone") { key: String -> CallTonePlayer.stop(key) }
    AsyncFunction("stopCallToneBeforeMedia") { CallTonePlayer.stopBeforeMedia() }
      .runOnQueue(Queues.MAIN)
  }
}
