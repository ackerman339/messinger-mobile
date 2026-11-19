package expo.modules.pulsedownloads

import android.content.ContentValues
import android.media.MediaScannerConnection
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException

private const val FOLDER_NAME = "Descargas Pulse"

class PulseDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PulseDownloads")

    AsyncFunction("save") { sourceUri: String, fileName: String, mimeType: String ->
      val source = File(requireNotNull(Uri.parse(sourceUri).path))
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        saveToMediaStore(source, fileName, mimeType)
      } else {
        saveToLegacyDownloads(source, fileName, mimeType)
      }
      true
    }
  }

  private fun saveToMediaStore(source: File, fileName: String, mimeType: String) {
    val resolver = requireNotNull(appContext.reactContext).contentResolver
    val values = ContentValues().apply {
      put(MediaStore.MediaColumns.DISPLAY_NAME, fileName)
      put(MediaStore.MediaColumns.MIME_TYPE, mimeType)
      put(MediaStore.MediaColumns.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$FOLDER_NAME/")
      put(MediaStore.MediaColumns.IS_PENDING, 1)
    }
    val downloads = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val uri = resolver.insert(downloads, values)
      ?: throw IOException("No se pudo crear el archivo en Descargas Pulse.")

    try {
      val output = resolver.openOutputStream(uri)
        ?: throw IOException("No se pudo escribir en Descargas Pulse.")
      output.use { stream -> source.inputStream().use { it.copyTo(stream) } }
      values.clear()
      values.put(MediaStore.MediaColumns.IS_PENDING, 0)
      if (resolver.update(uri, values, null, null) != 1) {
        throw IOException("No se pudo publicar el archivo en Descargas Pulse.")
      }
    } catch (error: Exception) {
      runCatching { resolver.delete(uri, null, null) }
      throw error
    }
  }

  @Suppress("DEPRECATION")
  private fun saveToLegacyDownloads(source: File, fileName: String, mimeType: String) {
    val downloads = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS)
    val directory = File(downloads, FOLDER_NAME)
    if (!directory.mkdirs() && !directory.isDirectory) {
      throw IOException("No se pudo crear la carpeta Descargas Pulse.")
    }

    val extensionIndex = fileName.lastIndexOf('.').takeIf { it > 0 } ?: fileName.length
    val stem = fileName.substring(0, extensionIndex)
    val extension = fileName.substring(extensionIndex)
    var destination = File(directory, fileName)
    var suffix = 1
    while (!destination.createNewFile()) {
      destination = File(directory, "$stem (${suffix++})$extension")
    }

    try {
      destination.outputStream().use { stream -> source.inputStream().use { it.copyTo(stream) } }
    } catch (error: Exception) {
      destination.delete()
      throw error
    }

    MediaScannerConnection.scanFile(appContext.reactContext, arrayOf(destination.path), arrayOf(mimeType), null)
  }
}
