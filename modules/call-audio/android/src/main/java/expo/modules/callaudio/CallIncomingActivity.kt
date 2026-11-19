package expo.modules.callaudio

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.WindowManager
import android.widget.*
import java.lang.ref.WeakReference

/** Lock-screen UI only. Signaling remains in the existing notification response handlers. */
class CallIncomingActivity : Activity() {
  private var id = ""
  private lateinit var name: TextView
  private lateinit var kind: TextView

  override fun onKeyDown(keyCode: Int, event: android.view.KeyEvent): Boolean {
    if (
      keyCode == android.view.KeyEvent.KEYCODE_VOLUME_DOWN ||
        keyCode == android.view.KeyEvent.KEYCODE_VOLUME_UP
    ) {
      CallService.silence(id)
      return true
    }
    return super.onKeyDown(keyCode, event)
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    id = intent.getStringExtra("id") ?: ""
    instance = WeakReference(this)
    if (android.os.Build.VERSION.SDK_INT >= 27) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    } else
      window.addFlags(
        WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
          WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
      )
    window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
    val layout =
      LinearLayout(this).apply {
        orientation = LinearLayout.VERTICAL
        gravity = Gravity.CENTER
        setPadding(40, 60, 40, 60)
        setBackgroundColor(Color.rgb(230, 244, 254))
      }
    name =
      TextView(this).apply {
        textSize = 30f
        gravity = Gravity.CENTER
        setTextColor(Color.rgb(30, 41, 59))
      }
    layout.addView(name, LinearLayout.LayoutParams(-1, -2))
    kind =
      TextView(this).apply {
        text = CallService.current()?.incomingDescription() ?: "Llamada entrante"
        textSize = 18f
        gravity = Gravity.CENTER
        setPadding(0, 24, 0, 80)
      }
    layout.addView(kind)
    val buttons = LinearLayout(this).apply { gravity = Gravity.CENTER }
    for ((label, accept) in listOf("Rechazar" to false, "Aceptar" to true)) {
      buttons.addView(
        Button(this).apply {
          text = label
          setOnClickListener {
            val call =
              CallService.current()?.takeIf { it.id == this@CallIncomingActivity.id }
                ?: return@setOnClickListener
            if (accept) CallIncomingNotification.answer(this@CallIncomingActivity, call)
            else CallIncomingNotification.reject(this@CallIncomingActivity, call)
          }
        },
        LinearLayout.LayoutParams(0, -2, 1f),
      )
    }
    layout.addView(buttons, LinearLayout.LayoutParams(-1, -2))
    setContentView(layout)
    update()
  }

  private fun update() {
    val call = CallService.current()
    if (call?.id != id) {
      finish()
      return
    }
    name.text = call.name
    kind.text = call.incomingDescription()
  }

  override fun onNewIntent(value: android.content.Intent) {
    super.onNewIntent(value)
    intent = value
    id = value.getStringExtra("id") ?: ""
    update()
  }

  override fun onDestroy() {
    if (instance.get() === this) instance.clear()
    super.onDestroy()
  }

  companion object {
    private var instance = WeakReference<CallIncomingActivity>(null)

    fun refresh() {
      instance.get()?.update()
    }

    fun dismiss(id: String) {
      instance.get()?.takeIf { it.id == id }?.finish()
    }
  }
}
