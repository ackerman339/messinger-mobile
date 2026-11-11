package expo.modules.callaudio

import android.Manifest
import android.app.NotificationManager
import android.app.Notification
import android.app.NotificationChannel
import android.content.Context
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import io.wazo.callkeep.VoiceConnectionService
import io.wazo.callkeep.Constants.FOREGROUND_SERVICE_NOTIFICATION_ID
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/** Promote the existing Telecom service before AudioRecord opens; ringing never requests a mic. */
internal object CallMediaSession {
  private val main = Handler(Looper.getMainLooper())
  private var callId: String? = null
  private var generation = 0
  private var cpu: PowerManager.WakeLock? = null

  suspend fun start(context: Context, id: String) = withContext(Dispatchers.Main) {
    check(context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) {
      "Permite el micrófono antes de atender la llamada."
    }
    if (callId == id && cpu?.isHeld == true) return@withContext
    release()
    callId = id
    val version = ++generation
    val deadline = System.currentTimeMillis() + 5_000
    val notifications = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    while (version == generation && callId == id) {
      val service = VoiceConnectionService.currentConnectionService
      val connection = VoiceConnectionService.getConnection(id)
      if (service != null && connection != null) {
        val notice = notifications.activeNotifications.firstOrNull { it.id == FOREGROUND_SERVICE_NOTIFICATION_ID }?.notification
          ?: ongoingNotice(context, notifications)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          service.startForeground(FOREGROUND_SERVICE_NOTIFICATION_ID, notice,
            ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
        } else service.startForeground(FOREGROUND_SERVICE_NOTIFICATION_ID, notice)
        val power = context.getSystemService(Context.POWER_SERVICE) as PowerManager
        cpu = power.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Messinger:CallMedia").apply {
          setReferenceCounted(false)
          acquire()
        }
        CallWindowState.active(id)
        return@withContext
      }
      check(System.currentTimeMillis() < deadline) { "No se pudo preparar el servicio de micrófono de Android." }
      delay(50)
    }
    error("La llamada terminó antes de abrir el micrófono.")
  }

  fun stop(id: String) {
    main.post {
      if (callId == id) {
        generation++
        callId = null
        release()
      }
    }
  }

  private fun release() {
    if (cpu?.isHeld == true) cpu?.release()
    cpu = null
  }
  private fun ongoingNotice(context: Context, notifications: NotificationManager): Notification {
    val channel = "messinger-ongoing-calls"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && notifications.getNotificationChannel(channel) == null) {
      notifications.createNotificationChannel(NotificationChannel(channel, "Llamadas en curso", NotificationManager.IMPORTANCE_LOW))
    }
    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) Notification.Builder(context, channel) else Notification.Builder(context)
    return builder.setSmallIcon(android.R.drawable.sym_call_incoming).setContentTitle("Llamada de Messinger en curso")
      .setCategory(Notification.CATEGORY_SERVICE).setOngoing(true).build()
  }
}
