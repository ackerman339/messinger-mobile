package expo.modules.callaudio

import android.app.Activity
import android.app.Application
import android.os.*
import android.view.WindowManager
import java.lang.ref.WeakReference

/** Keeps the host above the keyguard through the native-to-React call handoff. */
internal object CallWindowState : Application.ActivityLifecycleCallbacks {
  private var registered = false
  private var host = ""
  private var activity = WeakReference<Activity>(null)
  private var panel: String? = null
  private var pendingGroupAnswer: String? = null
  private val main = Handler(Looper.getMainLooper())
  private val expireGroupAnswer = Runnable { clearGroupAnswer() }

  fun initialize(app: Application) {
    if (registered) return
    registered = true
    host = app.packageManager.getLaunchIntentForPackage(app.packageName)?.component?.className ?: ""
    app.registerActivityLifecycleCallbacks(this)
  }

  fun panel(id: String, visible: Boolean) = main.post {
    if (visible) {
      panel = id
      if (pendingGroupAnswer == id) {
        clearGroupAnswer()
        return@post
      }
    } else if (panel == id) panel = null
    refresh()
  }

  fun prepareGroupAnswer(id: String) {
    pendingGroupAnswer = id
    main.removeCallbacks(expireGroupAnswer)
    main.postDelayed(expireGroupAnswer, 30_000)
    refresh()
  }

  fun clearGroupAnswer() {
    pendingGroupAnswer = null
    main.removeCallbacks(expireGroupAnswer)
    refresh()
  }

  internal fun shouldShowWhenLocked() =
    CallService.current() != null || pendingGroupAnswer != null || panel != null

  fun refresh() {
    val target = activity.get() ?: return
    val visible = shouldShowWhenLocked()
    if (Build.VERSION.SDK_INT >= 27) target.setShowWhenLocked(visible)
    else if (visible) target.window.addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
    else target.window.clearFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED)
  }

  override fun onActivityCreated(value: Activity, state: Bundle?) {
    track(value)
  }

  override fun onActivityResumed(value: Activity) {
    track(value)
  }

  private fun track(value: Activity) {
    if (value.javaClass.name == host) {
      activity = WeakReference(value)
      refresh()
    }
  }

  override fun onActivityDestroyed(value: Activity) {
    if (activity.get() === value) {
      activity.clear()
      panel = null
    }
  }

  override fun onActivityStarted(value: Activity) {}

  override fun onActivityStopped(value: Activity) {}

  override fun onActivityPaused(value: Activity) {}

  override fun onActivitySaveInstanceState(value: Activity, state: Bundle) {}
}
