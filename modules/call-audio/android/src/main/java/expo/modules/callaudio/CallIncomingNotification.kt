package expo.modules.callaudio

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import expo.modules.notifications.notifications.model.NotificationAction
import expo.modules.notifications.notifications.model.NotificationContent
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.notifications.model.NotificationResponse
import expo.modules.notifications.notifications.triggers.ChannelAwareTrigger
import expo.modules.notifications.service.NotificationsService
import java.time.Instant

internal data class CallInfo(
  val id: String,
  val caller: String,
  val media: String,
  val name: String,
  val deadline: Long,
  val incoming: Boolean = true,
) {
  fun intent(context: Context, action: String) =
    Intent(context, CallService::class.java)
      .setAction(action)
      .putExtra("id", id)
      .putExtra("caller", caller)
      .putExtra("media", media)
      .putExtra("name", name)
      .putExtra("deadline", deadline)
      .putExtra("incoming", incoming)

  companion object {
    fun from(intent: Intent) =
      CallInfo(
        intent.getStringExtra("id") ?: "",
        intent.getStringExtra("caller") ?: "",
        intent.getStringExtra("media") ?: "audio",
        intent.getStringExtra("name") ?: "Contacto",
        intent.getLongExtra("deadline", 0),
        intent.getBooleanExtra("incoming", true),
      )
  }
}

/** Builds presentation only. CallService owns the ringtone, deadlines and user actions. */
internal object CallIncomingNotification {
  const val CHANNEL = "pulse-incoming-calls-v2"
  private const val ONGOING_CHANNEL = "pulse-active-calls"

  fun channels(context: Context) {
    val manager = context.getSystemService(NotificationManager::class.java)
    manager.createNotificationChannel(
      NotificationChannel(
          CHANNEL,
          "Llamadas entrantes",
          NotificationManager.IMPORTANCE_HIGH,
        )
        .apply {
          setSound(null, null)
          enableVibration(true)
          vibrationPattern = longArrayOf(0, 500, 300, 500)
          lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        }
    )
    manager.createNotificationChannel(
      NotificationChannel(
          ONGOING_CHANNEL,
          "Llamadas en curso",
          NotificationManager.IMPORTANCE_LOW,
        )
        .apply { setSound(null, null) }
    )
  }

  private fun response(context: Context, call: CallInfo, action: String): PendingIntent {
    val content =
      NotificationContent.Builder()
        .setTitle(call.name)
        .setText(if (call.media == "video") "Videollamada entrante" else "Llamada entrante")
        .setBody(
          org.json
            .JSONObject()
            .put("type", "call-incoming")
            .put("callId", call.id)
            .put("callerId", call.caller)
            .put("media", call.media)
            .put("expiresAt", Instant.ofEpochMilli(call.deadline).toString())
            .put("localNotification", "call")
            .put("nativeCallService", true)
        )
        .build()
    val model =
      expo.modules.notifications.notifications.model.Notification(
        NotificationRequest("messinger-call:" + call.id, content, ChannelAwareTrigger(CHANNEL))
      )
    val forward =
      NotificationsService.createNotificationResponseIntent(
        context,
        model,
        NotificationAction(action, action, action != "reject"),
      )
    val intent =
      if (action == "reject") Intent(context, CallActionReceiver::class.java)
      else Intent(context, CallActionActivity::class.java)
    intent.action = "pulse.call." + action
    intent.data = android.net.Uri.parse("pulse-call://action/" + call.id + "/" + action)
    intent
      .putExtra("id", call.id)
      .putExtra("action", action)
      .putExtra("forward", forward)
      .putExtra("deadline", call.deadline)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    return if (action == "reject")
      PendingIntent.getBroadcast(context, call.id.hashCode(), intent, flags)
    else PendingIntent.getActivity(context, call.id.hashCode(), intent, flags)
  }

  fun incoming(
    context: Context,
    call: CallInfo,
    fullScreen: Boolean,
    silenced: Boolean,
  ): Notification {
    channels(context)
    val answer = response(context, call, "accept")
    val reject = response(context, call, "reject")
    val builder =
      NotificationCompat.Builder(context, CHANNEL)
        .setSmallIcon(android.R.drawable.sym_call_incoming)
        .setContentTitle(call.name)
        .setContentText(
          if (call.media == "video") "Videollamada entrante" else "Llamada de voz entrante"
        )
        .setCategory(NotificationCompat.CATEGORY_CALL)
        .setPriority(NotificationCompat.PRIORITY_MAX)
        .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        .setOngoing(true)
        .setAutoCancel(false)
        .setOnlyAlertOnce(true)
        .setContentIntent(response(context, call, NotificationResponse.DEFAULT_ACTION_IDENTIFIER))
        .addAction(0, "Rechazar", reject)
        .addAction(0, "Aceptar", answer)
        .setTimeoutAfter((call.deadline - System.currentTimeMillis()).coerceAtLeast(1))
    val manager = context.getSystemService(NotificationManager::class.java)
    if (
      fullScreen && !silenced && (Build.VERSION.SDK_INT < 34 || manager.canUseFullScreenIntent())
    ) {
      val panel =
        Intent(context, CallIncomingActivity::class.java)
          .putExtra("id", call.id)
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      builder.setFullScreenIntent(
        PendingIntent.getActivity(
          context,
          call.id.hashCode(),
          panel,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
        true,
      )
    }
    if (silenced) builder.setSilent(true)
    return builder.build()
  }

  fun ongoing(context: Context, call: CallInfo): Notification {
    channels(context)
    val open =
      (context.packageManager.getLaunchIntentForPackage(context.packageName)
          ?: Intent(Intent.ACTION_VIEW).setPackage(context.packageName))
        .apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
    return NotificationCompat.Builder(context, ONGOING_CHANNEL)
      .setSmallIcon(android.R.drawable.sym_call_incoming)
      .setContentTitle(call.name)
      .setContentText("Llamada de pulse en curso")
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setOngoing(true)
      .setSilent(true)
      .setContentIntent(
        PendingIntent.getActivity(
          context,
          7402,
          open,
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )
      )
      .build()
  }

  fun answer(context: Context, call: CallInfo) = response(context, call, "accept").send()

  fun reject(context: Context, call: CallInfo) = response(context, call, "reject").send()
}
