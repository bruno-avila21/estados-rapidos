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
import java.io.BufferedOutputStream
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

class PuenteArchivos(private val activity: AppCompatActivity, private val web: WebView) {

    // Un solo hilo: procesa guardarParaCompartir/compartirPreparadas EN ORDEN de llegada, sin
    // sincronización manual (ronda "publicar más rápido": el JS llama una vez por imagen, apenas
    // la tiene lista, en vez de juntar un JSON con el base64 de todas antes de mandar nada).
    private val hilos = Executors.newSingleThreadExecutor()
    private var contenidoPendiente: String? = null
    private val archivosParaCompartir = ArrayList<File>()

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
     * Escribe UNA imagen a disco apenas el JS la tiene lista (ronda "publicar más rápido": antes
     * `compartirImagenes` recibía un JSON con el base64 de TODAS las imágenes juntas, una string
     * de varios MB con 10 fotos, y no arrancaba a escribir nada hasta tener esa string entera).
     * `indice == 0` reinicia la carpeta de esta tanda (se asume una sola tanda de compartir en
     * vuelo por vez, que es como la usa la hoja de revisión).
     * @param indice    posición de este archivo dentro de la tanda (0, 1, 2…)
     * @param dataUrl   `"data:image/jpeg;base64,...."` (también acepta base64 sin el prefijo)
     */
    @JavascriptInterface
    fun guardarParaCompartir(indice: Int, dataUrl: String) {
        hilos.execute {
            try {
                if (indice == 0) {
                    carpetaCompartir.deleteRecursively()
                    carpetaCompartir.mkdirs()
                    archivosParaCompartir.clear()
                }
                val base64 = dataUrl.substringAfter("base64,", dataUrl)
                val bytes = Base64.decode(base64, Base64.NO_WRAP)
                val archivo = File(carpetaCompartir, "estado_%02d.jpg".format(indice))
                // BufferedOutputStream en el hilo de fondo: nada de esto corre en el hilo de UI.
                BufferedOutputStream(FileOutputStream(archivo)).use { it.write(bytes) }
                archivosParaCompartir.add(archivo)
            } catch (e: Exception) {
                aviso("No se pudo preparar la imagen ${indice + 1}: ${e.message}")
            }
        }
    }

    /**
     * Dispara el chooser de Android con TODAS las imágenes que `guardarParaCompartir` ya escribió
     * a disco. `texto` es la descripción que `copiarDescripcion` ya puso en el portapapeles; si
     * viene vacía (interruptor "Incluir texto" apagado) no se manda EXTRA_TEXT.
     */
    @JavascriptInterface
    fun compartirPreparadas(texto: String) {
        hilos.execute {
            try {
                val archivos = ArrayList(archivosParaCompartir)
                if (archivos.isEmpty()) { aviso("No había nada para compartir"); return@execute }

                val uris = archivos.map { FileProvider.getUriForFile(activity, "${activity.packageName}.archivos", it) }
                val intent = Intent(if (uris.size == 1) Intent.ACTION_SEND else Intent.ACTION_SEND_MULTIPLE).apply {
                    type = "image/jpeg"
                    if (texto.isNotBlank()) putExtra(Intent.EXTRA_TEXT, texto)
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

    private val carpetaCompartir: File
        get() = File(activity.cacheDir, "compartir")

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
