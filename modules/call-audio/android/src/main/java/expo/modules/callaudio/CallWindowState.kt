package expo.modules.callaudio

import android.app.Activity
import android.app.Application
import android.os.*
import android.view.WindowManager
import java.lang.ref.WeakReference

/**
 * Only the real app activity may remain over the keyguard while its React call panel is visible.
 */
internal object CallWindowState : Application.ActivityLifecycleCallbacks {
  private var registered = false
  private var host = ""
  private var activity = WeakReference<Activity>(null)
  private var panel: String? = null
  private val main = Handler(Looper.getMainLooper())

  fun initialize(app: Application) {
    if (registered) return
    registered = true
    host = app.packageManager.getLaunchIntentForPackage(app.packageName)?.component?.className ?: ""
    app.registerActivityLifecycleCallbacks(this)
  }

  fun panel(id: String, visible: Boolean) = main.post {
    if (visible) panel = id else if (panel == id) panel = null
    refresh()
  }

  fun refresh() {
    val visible = CallService.current() != null || panel != null
    val target = activity.get() ?: return
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
