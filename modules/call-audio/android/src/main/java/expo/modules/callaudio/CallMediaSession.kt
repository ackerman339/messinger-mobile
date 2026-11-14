package expo.modules.callaudio

import android.content.Context
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

internal object CallMediaSession {
  suspend fun start(context: Context, id: String, media: String, owner: String) =
    withContext(Dispatchers.Main) {
      if (CallService.current()?.id != id)
        CallService.outgoing(
          context,
          CallInfo(id, "", media, "Contacto", System.currentTimeMillis() + 60_000, false),
          owner,
        )
      val deadline = System.currentTimeMillis() + 5000
      while (CallService.running?.call?.id != id) {
        check(System.currentTimeMillis() < deadline) {
          "No se pudo iniciar el servicio de llamada."
        }
        delay(25)
      }
      CallService.running!!.activate(id, owner, media)
    }

  fun stop(id: String, owner: String) {
    android.os.Handler(android.os.Looper.getMainLooper()).post {
      if (CallService.running?.owns(id, owner) == true) CallAudioRoutes.stop(id)
    }
  }
}
