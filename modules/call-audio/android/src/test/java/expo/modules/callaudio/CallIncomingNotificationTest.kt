package expo.modules.callaudio

import android.app.NotificationManager
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Looper
import android.os.PowerManager
import java.time.Duration
import java.util.UUID
import org.junit.After
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config
import org.robolectric.shadows.ShadowMediaPlayer

/** Existing integration checks use the new foreground-service boundary, without a Telecom mock. */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [28, 33])
class CallIncomingNotificationTest {
  private val context
    get() = RuntimeEnvironment.getApplication()

  private val players = mutableListOf<MediaPlayer>()
  private var controller: ServiceController<CallService>? = null

  @Before
  fun setup() {
    context.getSystemService(AudioManager::class.java).ringerMode = AudioManager.RINGER_MODE_NORMAL
    shadowOf(context).grantPermissions(android.Manifest.permission.RECORD_AUDIO)
    ShadowMediaPlayer.setMediaInfoProvider { ShadowMediaPlayer.MediaInfo(1000, 0) }
    ShadowMediaPlayer.setCreateListener { player, _ -> players.add(player) }
  }

  @After
  fun cleanup() {
    controller?.destroy()
    CallTonePlayer.stopBeforeMedia()
    context.getSystemService(NotificationManager::class.java).cancelAll()
    shadowOf(Looper.getMainLooper()).idle()
  }

  private fun launch(call: CallInfo): CallService {
    CallService.incoming(context, call)
    val intent = shadowOf(context).nextStartedService
    assertNotNull(intent)
    controller =
      Robolectric.buildService(CallService::class.java, intent).create().startCommand(0, 1)
    shadowOf(Looper.getMainLooper()).idle()
    return controller!!.get()
  }

  @Test
  fun incomingRingsNativelyAndSelectsPanelOrNotificationUsingTheScreen() {
    for (screenOn in listOf(true, false)) for (media in listOf("audio", "video")) {
      shadowOf(context.getSystemService(PowerManager::class.java)).setIsInteractive(screenOn)
      val call =
        CallInfo(
          UUID.randomUUID().toString(),
          "caller",
          media,
          "Contacto",
          System.currentTimeMillis() + 30_000,
        )
      val service = launch(call)
      val notice = shadowOf(service).lastForegroundNotification
      assertEquals(!screenOn, notice.fullScreenIntent != null)
      assertEquals(listOf("Rechazar", "Aceptar"), notice.actions.map { it.title.toString() })
      assertTrue(players.last().isPlaying)
      assertTrue(players.last().isLooping)
      if (android.os.Build.VERSION.SDK_INT >= 29)
        assertEquals(
          android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL,
          service.foregroundServiceType,
        )
      val count = players.size
      service.onStartCommand(call.copy(name = "Ana").intent(context, "pulse.INCOMING"), 0, 2)
      shadowOf(Looper.getMainLooper()).idle()
      assertEquals(
        "Updating caller data must not create another ringtone player",
        count,
        players.size,
      )
      assertTrue(players.last().isPlaying)
      service.answer(call.id, "foreground")
      service.activate(call.id, "foreground")
      if (android.os.Build.VERSION.SDK_INT >= 29)
        assertEquals(
          android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL or
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE,
          service.foregroundServiceType,
        )
      CallService.finish(call.id, "headless", false)
      shadowOf(Looper.getMainLooper()).idle()
      assertFalse(
        "The headless runtime cannot end foreground-owned media",
        shadowOf(service).isForegroundStopped,
      )
      CallService.finish(call.id, "headless", true)
      shadowOf(Looper.getMainLooper()).idle()
      assertTrue(
        "A real remote hang-up must stop the native service",
        shadowOf(service).isForegroundStopped,
      )
      controller!!.destroy()
      controller = null
    }
  }

  @Test
  fun aDismissedOrExpiredCallCannotStartRingingAfterAsyncDelivery() {
    val id = UUID.randomUUID().toString()
    CallService.finish(id, "test", true)
    shadowOf(Looper.getMainLooper()).idle()
    CallService.incoming(
      context,
      CallInfo(id, "caller", "audio", "Contacto", System.currentTimeMillis() + 30_000),
    )
    CallService.incoming(
      context,
      CallInfo(UUID.randomUUID().toString(), "caller", "audio", "Contacto", 0),
    )
    assertNull(shadowOf(context).nextStartedService)
    assertTrue(players.isEmpty())
  }

  @Test
  fun theNativeServiceRingsAndExpiresWithoutAReactActivityOrJavascriptTimer() {
    shadowOf(context.getSystemService(PowerManager::class.java)).setIsInteractive(false)
    val service =
      launch(
        CallInfo(
          UUID.randomUUID().toString(),
          "caller",
          "video",
          "Contacto",
          System.currentTimeMillis() + 2000,
        )
      )
    assertTrue(players.single().isPlaying)
    assertNotNull(shadowOf(service).lastForegroundNotification.fullScreenIntent)
    shadowOf(Looper.getMainLooper()).idleFor(Duration.ofSeconds(3))
    assertEquals(ShadowMediaPlayer.State.END, shadowOf(players.single()).state)
    assertTrue(shadowOf(service).isForegroundStopped)
    assertNull(CallService.current())
  }
}
