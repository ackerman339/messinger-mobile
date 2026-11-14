package expo.modules.callaudio

import android.os.Looper
import android.os.PowerManager
import com.google.firebase.messaging.RemoteMessage
import java.time.Instant
import java.util.UUID
import org.junit.After
import org.junit.Assert.*
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.json.JSONObject

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28, 33])
class CallPushTest {
  private val context get() = RuntimeEnvironment.getApplication()
  @After fun cleanup() { CallPushSession.set(context, null) }

  @Test fun nativePushRequiresMatchingSessionAndPreservesScreenAtReceipt() {
    val receiver = Robolectric.buildService(CallFirebaseMessagingService::class.java).create().get()
    val power = context.getSystemService(PowerManager::class.java)
    for (screenOn in listOf(true, false)) for (media in listOf("audio", "video")) {
      CallPushSession.set(context, "recipient")
      shadowOf(power).setIsInteractive(screenOn)
      val payload = JSONObject().put("type", "call-incoming")
        .put("callId", UUID.randomUUID().toString()).put("callerId", "caller")
        .put("recipientId", "other").put("media", media)
        .put("expiresAt", Instant.now().plusSeconds(30).toString())
      fun deliver() = receiver.onMessageReceived(RemoteMessage.Builder("test")
        .addData("body", payload.toString()).build())
      deliver()
      shadowOf(Looper.getMainLooper()).idle()
      assertNull(shadowOf(context).nextStartedService)
      payload.put("recipientId", "recipient")
      deliver()
      shadowOf(power).setIsInteractive(!screenOn)
      shadowOf(Looper.getMainLooper()).idle()
      val intent = shadowOf(context).nextStartedService
      assertNotNull(intent)
      assertEquals(!screenOn, intent.getBooleanExtra("screenOff", screenOn))
      assertEquals(media, intent.getStringExtra("media"))
    }
    receiver.onDestroy()
  }
}
