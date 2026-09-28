package com.estadosrapidos.app

// Lo que el WebView no puede hacer solo: compartir varias imágenes a la vez (WhatsApp),
// guardar el respaldo .json donde el usuario elija, y copiar al portapapeles. Los tres viven
// del lado nativo porque `navigator.share({files})`, `<a download>` y `navigator.clipboard`
// no son confiables dentro de un WebView (skill crear-apk).

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import org.json.JSONArray
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

class PuenteArchivos(private val activity: AppCompatActivity, private val web: WebView) {

    private val hilos = Executors.newSingleThreadExecutor()
    private var contenidoPendiente: String? = null

    // El picker de "dónde guardar" es async (el usuario elige la carpeta); el contenido a
    // escribir ya lo tenemos entero desde que lo llamó el JS. Cuando las dos cosas están listas,
    // se escribe.
    private val elegirDestino = activity.registerForActivityResult(
        ActivityResultContracts.CreateDocument("application/json")
    ) { uri ->
        val contenido = contenidoPendiente
        contenidoPendiente = null
        if (uri == null || contenido == null) return@registerForActivityResult
        hilos.execute {
            try {
                activity.contentResolver.openOutputStream(uri)?.use { it.write(contenido.toByteArray(Charsets.UTF_8)) }
                aviso("Respaldo guardado")
            } catch (e: Exception) {
                aviso("No se pudo guardar: ${e.message}")
            }
        }
    }

    private fun aviso(msg: String) {
        activity.runOnUiThread { Toast.makeText(activity, msg, Toast.LENGTH_SHORT).show() }
    }

    /**
     * @param datosJson  `["data:image/png;base64,....", "data:image/png;base64,...."]`
     *                   (también acepta base64 sin el prefijo `data:...;base64,`)
     * @param texto      la descripción que copiarDescripcion ya puso en el portapapeles; va
     *                   además como EXTRA_TEXT para que la app elegida (WhatsApp) la reciba.
     */
    @JavascriptInterface
    fun compartirImagenes(datosJson: String, texto: String) {
        hilos.execute {
            try {
                val carpeta = File(activity.cacheDir, "compartir").apply { deleteRecursively(); mkdirs() }
                val items = JSONArray(datosJson)
                val archivos = ArrayList<File>()
                for (i in 0 until items.length()) {
                    val crudo = items.getString(i)
                    val base64 = crudo.substringAfter("base64,", crudo)
                    val bytes = Base64.decode(base64, Base64.NO_WRAP)
                    val archivo = File(carpeta, "estado_%02d.png".format(i))
                    FileOutputStream(archivo).use { it.write(bytes) }
                    archivos.add(archivo)
                }
                if (archivos.isEmpty()) { aviso("No había nada para compartir"); return@execute }

                val uris = archivos.map { FileProvider.getUriForFile(activity, "${activity.packageName}.archivos", it) }
                val intent = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
                    type = "image/png"
                    putExtra(Intent.EXTRA_TEXT, texto)
                    if (uris.size == 1) {
                        putExtra(Intent.EXTRA_STREAM, uris[0])
                    } else {
                        putParcelableArrayListExtra(Intent.EXTRA_STREAM, ArrayList(uris))
                    }
                    // Sin esto, la app que se elija en el chooser (WhatsApp) no tiene permiso
                    // para leer las Uri de un content:// que no es suyo.
                    addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    clipData = ClipData.newUri(activity.contentResolver, "estados", uris[0]).apply {
                        for (u in uris.drop(1)) addItem(ClipData.Item(u))
                    }
                }
                activity.runOnUiThread {
                    activity.startActivity(Intent.createChooser(intent, null))
                }
            } catch (e: Exception) {
                aviso("No se pudo compartir: ${e.message}")
            }
        }
    }

    /**
     * Exportar respaldo (.json): el usuario elige dónde con el picker del sistema (SAF).
     * `mime` no se usa todavía: el único llamador de hoy es el respaldo .json y el contrato de
     * CreateDocument queda fijo en application/json al registrarse. Si el día de mañana se suma
     * otro tipo de archivo, hace falta un segundo launcher (el contrato es estático).
     */
    @JavascriptInterface
    fun guardarArchivo(nombre: String, mime: String, contenido: String) {
        contenidoPendiente = contenido
        activity.runOnUiThread {
            try {
                elegirDestino.launch(nombre)
            } catch (e: Exception) {
                contenidoPendiente = null
                aviso("No se pudo abrir el selector para guardar")
            }
        }
    }

    @JavascriptInterface
    fun copiar(texto: String) {
        activity.runOnUiThread {
            val cm = activity.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            cm.setPrimaryClip(ClipData.newPlainText("estados-rapidos", texto))
            Toast.makeText(activity, "Copiado", Toast.LENGTH_SHORT).show()
        }
    }

    /** Para "Versión 1.0 (APK)" en Ajustes → La app, sin hardcodear el número dos veces. */
    @JavascriptInterface
    fun version(): String = BuildConfig.VERSION_NAME
}
