package expo.modules.callaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.core.app.NotificationCompat
import expo.modules.notifications.notifications.enums.NotificationPriority
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.model.NotificationAction
import expo.modules.notifications.notifications.model.NotificationCategory
import expo.modules.notifications.notifications.presentation.builders.ExpoNotificationBuilder
import expo.modules.notifications.notifications.triggers.ChannelAwareTrigger
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationCategoriesStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import android.util.Log

/** Preserve Expo's existing accept/reject/body response intents, adding native ringing and full-screen UI. */
internal object CallIncomingNotification {
  private val main = Handler(Looper.getMainLooper())
  private data class Incoming(val caller: String, val media: String, val name: String, val deadline: Long)
  private val prepared = ConcurrentHashMap<String, Incoming>()
  private val revisions = ConcurrentHashMap<String, AtomicInteger>()
  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private const val CHANNEL = "messinger-incoming-calls-v3"
  private val dismissed = linkedSetOf<String>()
  private val silenced = linkedSetOf<String>()
  private fun tag(id: String) = "messinger-call:$id"
  private fun manager(context: Context) = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

  fun prepare(id: String, caller: String, media: String, name: String, deadline: Long) {
    prepared[id] = Incoming(caller, media, name, deadline)
    if (prepared.size > 64) prepared.keys.firstOrNull { it != id }?.let {
      prepared.remove(it)
      revisions.remove(it)
    }
  }
  fun onTelecomUi(context: Context, id: String) = prepared[id]?.let { call ->
    scope.launch {
      try { present(context, id, call.caller, call.media, call.name, call.deadline) }
      catch (error: Exception) { Log.w("MessingerIncomingCall", "Unable to present incoming call", error) }
    }
  }

  suspend fun present(context: Context, id: String, caller: String, media: String, name: String, deadline: Long) {
    val revision = revisions.computeIfAbsent(id) { AtomicInteger() }.incrementAndGet()
    prepare(id, caller, media, name, deadline)
    val sound = Uri.parse("android.resource://${context.packageName}/raw/messinger_incoming_call")
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager(context).createNotificationChannel(NotificationChannel(CHANNEL, "Llamadas entrantes", NotificationManager.IMPORTANCE_HIGH).apply {
        setSound(sound, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
          .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
        enableVibration(true)
        lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      })
    }
    val data = JSONObject().put("type", "call-incoming").put("callId", id).put("callerId", caller)
      .put("media", media).put("expiresAt", Instant.ofEpochMilli(deadline).toString()).put("localNotification", "call")
    val content = NotificationContent.Builder().setTitle(name)
      .setText(if (media == "video") "Videollamada entrante" else "Llamada de voz entrante")
      .setBody(data).setCategoryId("messingerIncomingCall").setSticky(true).setAutoDismiss(false)
      .setSound(sound).setPriority(NotificationPriority.MAX).build()
    val request = NotificationRequest(tag(id), content, ChannelAwareTrigger(CHANNEL))
    val model = expo.modules.notifications.notifications.model.Notification(request)
    val categories = SharedPreferencesNotificationCategoriesStore(context)
    if (categories.getNotificationCategory("messingerIncomingCall") == null) {
      categories.saveNotificationCategory(NotificationCategory("messingerIncomingCall", listOf(
        NotificationAction("reject", "Rechazar", false), NotificationAction("accept", "Aceptar", true))))
    }
    val base = ExpoNotificationBuilder(context, model, categories).build()
    withContext(Dispatchers.Main) {
      if (dismissed.contains(id) || revisions[id]?.get() != revision || deadline <= System.currentTimeMillis()) return@withContext
      val builder = Notification.Builder.recoverBuilder(context, base).setCategory(Notification.CATEGORY_CALL)
        .setVisibility(Notification.VISIBILITY_PUBLIC).setOnlyAlertOnce(true)
        .setTimeoutAfter(deadline - System.currentTimeMillis())
      val intent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      if (intent != null && (Build.VERSION.SDK_INT < 34 || manager(context).canUseFullScreenIntent())) {
        intent.action = Intent.ACTION_VIEW
        intent.data = Uri.parse("messingermobile://chat?incomingCall=$id")
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        builder.setFullScreenIntent(PendingIntent.getActivity(context, id.hashCode(), intent,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE), true)
      }
      var notice = builder.build()
      if (!silenced.contains(id)) notice.flags = notice.flags or Notification.FLAG_INSISTENT
      else notice = NotificationCompat.Builder(context, notice).setSilent(true).build()
      CallWindowState.incoming(id, deadline)
      manager(context).notify(tag(id), 0, notice)
    }
  }
  fun dismiss(context: Context, id: String) {
    if (Looper.myLooper() != Looper.getMainLooper()) {
      main.post { dismiss(context, id) }
      return
    }
    dismissed.add(id)
    prepared.remove(id)
    revisions.remove(id)
    if (dismissed.size > 256) dismissed.remove(dismissed.first())
    manager(context).cancel(tag(id), 0)
  }
  fun silence(context: Context, id: String) {
    silenced.add(id)
    if (silenced.size > 256) silenced.remove(silenced.first())
    val current = manager(context).activeNotifications.firstOrNull { it.tag == tag(id) } ?: return
    manager(context).cancel(tag(id), 0)
    val notice = NotificationCompat.Builder(context, current.notification).setSilent(true)
      .setOnlyAlertOnce(true).setFullScreenIntent(null, false).build()
    notice.flags = notice.flags and Notification.FLAG_INSISTENT.inv()
    manager(context).notify(tag(id), 0, notice)
  }
}
