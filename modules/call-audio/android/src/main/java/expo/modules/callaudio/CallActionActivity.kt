package expo.modules.callaudio

import android.app.Activity
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle

/** Notification -> Activity is allowed on Android 12+, unlike a broadcast launching the app. */
class CallActionActivity : Activity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    CallService.notificationAction(intent.getStringExtra("id") ?: "", "accept")
    @Suppress("DEPRECATION") val forward = intent.getParcelableExtra<PendingIntent>("forward")
    try {
      forward?.send()
    } catch (_: PendingIntent.CanceledException) {}
    finish()
  }
}

class CallActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    CallService.notificationAction(intent.getStringExtra("id") ?: "", "reject")
    @Suppress("DEPRECATION") val forward = intent.getParcelableExtra<PendingIntent>("forward")
    try {
      forward?.send()
    } catch (_: PendingIntent.CanceledException) {}
  }
}
