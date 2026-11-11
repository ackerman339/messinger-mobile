package expo.modules.callaudio

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.ActivityInfo
import android.content.pm.ResolveInfo
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import android.os.Looper
import expo.modules.notifications.notifications.model.NotificationAction
import expo.modules.notifications.notifications.model.NotificationCategory
import expo.modules.notifications.service.delegates.SharedPreferencesNotificationCategoriesStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import java.util.UUID

@OptIn(ExperimentalCoroutinesApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28])
class CallIncomingNotificationTest {
  private val context get() = RuntimeEnvironment.getApplication()
  private val notifications get() = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  @Before fun setup() {
    Dispatchers.setMain(UnconfinedTestDispatcher())
    SharedPreferencesNotificationCategoriesStore(context).saveNotificationCategory(
      NotificationCategory("messingerIncomingCall", listOf(
        NotificationAction("reject", "Rechazar", false), NotificationAction("accept", "Aceptar", true))))
    val launcher = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER).setPackage(context.packageName)
    shadowOf(context.packageManager).addResolveInfoForIntent(launcher, ResolveInfo().apply {
      activityInfo = ActivityInfo().apply { packageName = context.packageName; name = "MainActivity" }
    })
  }
  @After fun cleanup() { notifications.cancelAll(); Dispatchers.resetMain() }

  @Test fun incomingRingsInTheSystemAndKeepsExpoActionsAndFullScreenIntent() = runBlocking {
    val id = UUID.randomUUID().toString()
    CallIncomingNotification.present(context, id, "caller", "video", "Contacto", System.currentTimeMillis() + 30_000)
    val notice = notifications.activeNotifications.single().notification
    assertTrue(notice.flags and Notification.FLAG_INSISTENT != 0)
    assertNotNull(notice.fullScreenIntent)
    assertNotNull(notice.contentIntent)
    assertEquals(listOf("Rechazar", "Aceptar"), notice.actions.map { it.title.toString() })
    val channel = notifications.getNotificationChannel("messinger-incoming-calls-v3")
    assertTrue(channel.sound.toString().endsWith("/raw/messinger_incoming_call"))
    assertEquals(Notification.CATEGORY_CALL, notice.category)
  }

  @Test fun aDismissedOrExpiredCallCannotPostOrStartRingingAfterAsyncPreparation() = runBlocking {
    val id = UUID.randomUUID().toString()
    CallIncomingNotification.dismiss(context, id)
    shadowOf(Looper.getMainLooper()).idle()
    CallIncomingNotification.present(context, id, "caller", "audio", "Contacto", System.currentTimeMillis() + 30_000)
    CallIncomingNotification.present(context, UUID.randomUUID().toString(), "caller", "audio", "Contacto", 0)
    assertEquals(0, notifications.activeNotifications.size)
  }

  @Test fun telecomCanShowAndRingAfterJavascriptHeadlessExecutionHasFinished() = runBlocking {
    val id = UUID.randomUUID().toString()
    CallTonePlayer.initialize(context)
    CallIncomingNotification.prepare(id, "caller", "audio", "Contacto", System.currentTimeMillis() + 30_000)
    LocalBroadcastManager.getInstance(context).sendBroadcastSync(
      Intent("ACTION_SHOW_INCOMING_CALL_UI").putExtra("attributeMap", hashMapOf("EXTRA_CALL_UUID" to id)))
    withTimeout(5_000) { while (notifications.activeNotifications.isEmpty()) delay(10) }
    val notice = notifications.activeNotifications.single().notification
    assertTrue(notice.flags and Notification.FLAG_INSISTENT != 0)
    assertNotNull(notice.fullScreenIntent)
  }
}
