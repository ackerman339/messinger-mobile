package expo.modules.callaudio

import android.os.PowerManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject
import java.time.Instant

/** Present before Expo starts its headless runtime; Expo still owns tokens and signaling tasks. */
class CallFirebaseMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(message: RemoteMessage) {
    val screenOff = !getSystemService(PowerManager::class.java).isInteractive
    val payload = runCatching {
      JSONObject(message.data["body"] ?: message.data["dataString"] ?: JSONObject(message.data).toString())
    }.getOrNull()
    val type = payload?.optString("type")
    if (payload != null && (type == "call-incoming" || type == "call-missed")) {
      val id = payload.optString("callId").lowercase()
      if (!id.matches(Regex("[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}"))) return
      val user = CallPushSession.user(this)
      if (user == null || payload.optString("recipientId") != user) {
        Log.i("PulseCallPush", "callId=$id stage=session-rejected")
        return
      }
      Log.i("PulseCallPush", "callId=$id stage=fcm priority=${message.priority} original=${message.originalPriority} screenOff=$screenOff")
      val deadline = runCatching { Instant.parse(payload.optString("expiresAt")).toEpochMilli() }.getOrNull()
      if (type == "call-missed") CallService.finish(id, "push", true)
      else if (deadline != null && deadline > System.currentTimeMillis()) {
        val data = CallInfo(id, payload.optString("callerId"),
          if (payload.optString("media") == "video") "video" else "audio", payload.optString("callerName").trim().take(100).ifBlank { "Usuario desconocido" }, deadline)
        Handler(Looper.getMainLooper()).post {
          if (CallPushSession.user(this) == user) {
            try {
              CallService.incoming(this, data, screenOff, user)
            } catch (error: Exception) {
              Log.e("PulseCallPush", "callId=$id stage=service-start-failed error=${error.javaClass.simpleName}")
              CallIncomingNotification.channels(this)
              getSystemService(android.app.NotificationManager::class.java)
                .notify(7401, CallIncomingNotification.incoming(this, data, screenOff, false, serviceFailed = true))
            }
          }
        }
      } else Log.i("PulseCallPush", "callId=$id stage=expired-or-invalid")
    }
    super.onMessageReceived(message)
  }
}
