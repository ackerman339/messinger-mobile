package expo.modules.callaudio

import android.app.Activity
import android.app.Application
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import java.lang.ref.WeakReference

/** Allow only the current call panel above the keyguard, without changing the app's global manifest. */
internal object CallWindowState : Application.ActivityLifecycleCallbacks {
  private val main = Handler(Looper.getMainLooper())
  private var registered = false
  private var activity = WeakReference<Activity>(null)
  private var callId: String? = null
  private var expiresAt = 0L
  private val expiry = Runnable { callId = null; apply() }

  fun initialize(application: Application) {
    if (!registered) {
      application.registerActivityLifecycleCallbacks(this)
      registered = true
    }
  }
  fun attach(value: Activity) { main.post { activity = WeakReference(value); apply() } }
  fun incoming(id: String, deadline: Long) {
    main.post {
      callId = id
      expiresAt = deadline
      main.removeCallbacks(expiry)
      main.postDelayed(expiry, (deadline - System.currentTimeMillis()).coerceAtLeast(0))
      apply()
    }
  }
  fun active(id: String) {
    main.post {
      callId = id
      expiresAt = Long.MAX_VALUE
      main.removeCallbacks(expiry)
      apply()
    }
  }
  fun finish(id: String) {
    main.post { if (callId == id) { callId = null; main.removeCallbacks(expiry); apply() } }
  }
  private fun apply() {
    val visible = callId != null && expiresAt > System.currentTimeMillis()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      activity.get()?.setShowWhenLocked(visible)
      activity.get()?.setTurnScreenOn(visible && expiresAt != Long.MAX_VALUE)
    } else {
      val flags = WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      if (visible) activity.get()?.window?.addFlags(flags) else activity.get()?.window?.clearFlags(flags)
    }
  }
  override fun onActivityCreated(value: Activity, state: Bundle?) { activity = WeakReference(value); apply() }
  override fun onActivityResumed(value: Activity) { activity = WeakReference(value); apply() }
  override fun onActivityDestroyed(value: Activity) { if (activity.get() === value) activity.clear() }
  override fun onActivityStarted(value: Activity) {}
  override fun onActivityPaused(value: Activity) {}
  override fun onActivityStopped(value: Activity) {}
  override fun onActivitySaveInstanceState(value: Activity, state: Bundle) {}
}
