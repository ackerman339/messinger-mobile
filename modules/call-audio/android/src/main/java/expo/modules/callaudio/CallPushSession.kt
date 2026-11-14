package expo.modules.callaudio

import android.content.Context

/** Non-secret routing identity only; never persist access tokens here. */
internal object CallPushSession {
  private fun prefs(context: Context) = context.getSharedPreferences("call-push-session", Context.MODE_PRIVATE)
  fun user(context: Context) = prefs(context).getString("user", null)
  fun set(context: Context, user: String?) {
    check(prefs(context).edit().apply {
      if (user == null) remove("user") else putString("user", user)
    }.commit()) { "No se pudo guardar la sesión de llamadas." }
  }
}
