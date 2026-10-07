package com.estadosrapidos.app

// Lo que el WebView no puede hacer solo: compartir varias imágenes a la vez (WhatsApp),
// guardar el respaldo .json donde el usuario elija, guardar la copia AUTOMÁTICA diaria sin picker,
// y copiar al portapapeles. Los cuatro viven del lado nativo porque `navigator.share({files})`,
// `<a download>` y `navigator.clipboard` no son confiables dentro de un WebView (skill crear-apk).

import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.webkit.WebView
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.FileProvider
import java.io.BufferedOutputStream
import java.io.BufferedWriter
import java.io.File
import java.io.FileOutputStream
import java.io.OutputStream
import java.io.OutputStreamWriter
import java.io.Writer
import java.util.concurrent.Executors

class PuenteArchivos(private val activity: AppCompatActivity, private val web: WebView) {

    // Un solo hilo: procesa guardarParaCompartir/compartirPreparadas EN ORDEN de llegada, sin
    // sincronización manual (ronda "publicar más rápido": el JS llama una vez por imagen, apenas
    // la tiene lista, en vez de juntar un JSON con el base64 de todas antes de mandar nada).
    private val hilos = Executors.newSingleThreadExecutor()
    private var contenidoPendiente: String? = null
    private val archivosParaCompartir = ArrayList<File>()

    // Copia automática diaria (ronda "copia automática"): el `Writer` queda abierto entre
    // `copiaAutomaticaAbrir` y `copiaAutomaticaCerrar` — todo en `hilos`, así que llega en el
    // mismo orden en que el JS llamó (abrir → N partes → cerrar), sin sincronización manual.
    private var copiaAutomaticaEscritor: Writer? = null
    private val CARPETA_COPIA_AUTOMATICA = "EstadosRapidos"
    // Mismo patrón que `nombresARotar` en js/respaldo-automatico.js (node --test): la fecha va
    // primero y en formato AAAA-MM-DD, así que el orden lexicográfico del nombre YA es cronológico.
    private val PATRON_NOMBRE_COPIA = Regex("""^estados-rapidos-\d{4}-\d{2}-\d{2}.*\.json$""")

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
    // Fotos que otra app compartió a esta (galería → Compartir → Estados Rápidos): devuelve las
    // rutas (mismo origen que la app) como JSON y vacía la lista — cada foto se entrega una vez.
    @JavascriptInterface
    fun fotosCompartidas(): String = org.json.JSONArray(FotosCompartidas.tomar()).toString()

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

    // --- Copia automática diaria (ronda "copia automática", Respaldo → "Preferencias de
    // respaldo"): mismo JSON que `guardarArchivo`, pero SIN picker — el JS la dispara sola cuando
    // pasaron 24h o más desde la última (js/respaldo-automatico.js, `tocaCopiarAutomatica`, ya
    // probado con node --test) y tiene que aparecer en Documents/EstadosRapidos/ sin pedir un
    // permiso amplio de almacenamiento. Streaming (abrir → N partes → cerrar) porque con 50
    // productos con foto el JSON de base64 pesa varios MB — nunca se junta la string entera de
    // este lado antes de escribir (mismo criterio que `guardarParaCompartir`, que ya escribe una
    // imagen por vez en vez de un JSON con todas juntas). ---

    /** Abre el archivo de destino y deja el `Writer` listo para recibir partes. Android 10+
     * (API 29): MediaStore, sin ningún permiso de almacenamiento. Antes de esa versión, MediaStore
     * con `RELATIVE_PATH` no existe y pedir `WRITE_EXTERNAL_STORAGE` sería el permiso amplio que
     * este brief pide evitar — se degrada a la carpeta propia de la app (sin permiso, pero no
     * aparece en el explorador de archivos del sistema; limitación conocida, no un bug). */
    @JavascriptInterface
    fun copiaAutomaticaAbrir(nombre: String) {
        hilos.execute {
            try {
                val salida = abrirSalidaCopiaAutomatica(nombre)
                copiaAutomaticaEscritor = BufferedWriter(OutputStreamWriter(salida, Charsets.UTF_8))
            } catch (e: Exception) {
                copiaAutomaticaEscritor = null
                aviso("No se pudo iniciar la copia automática: ${e.message}")
            }
        }
    }

    /** Una parte del JSON (texto plano, no base64 del archivo entero — el contenido YA es texto
     * UTF-8, los `data:` de las fotos son strings adentro del JSON). El JS manda varias partes de
     * ~2M de caracteres cada una en vez de un solo string gigante (`guardarCopiaAutomaticaApk`,
     * js/utils/plataforma.js). */
    @JavascriptInterface
    fun copiaAutomaticaEscribir(fragmento: String) {
        hilos.execute {
            try {
                copiaAutomaticaEscritor?.write(fragmento)
            } catch (e: Exception) {
                aviso("No se pudo escribir la copia automática: ${e.message}")
            }
        }
    }

    /** Cierra el archivo, rota las copias viejas (conserva 7) y avisa con un Toast discreto —
     * el ÚNICO aviso de todo el flujo automático (nunca bloquea ni pide confirmación: corre sola,
     * en segundo plano, sin que la persona la pidiera en el momento). */
    @JavascriptInterface
    fun copiaAutomaticaCerrar() {
        hilos.execute {
            try {
                copiaAutomaticaEscritor?.flush()
                copiaAutomaticaEscritor?.close()
                copiaAutomaticaEscritor = null
                rotarCopiasAutomaticas()
                aviso("Copia automática guardada en Documentos/EstadosRapidos")
            } catch (e: Exception) {
                aviso("No se pudo terminar la copia automática: ${e.message}")
            }
        }
    }

    private fun abrirSalidaCopiaAutomatica(nombre: String): OutputStream {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val coleccion = MediaStore.Files.getContentUri("external")
            val rutaRelativa = "${Environment.DIRECTORY_DOCUMENTS}/$CARPETA_COPIA_AUTOMATICA/"
            // Si ya existe un archivo con el mismo nombre (2 copias el mismo día, ej. reinstalar
            // para probar), lo pisa en vez de sumar un "(1)" que rompería la rotación por nombre.
            activity.contentResolver.delete(
                coleccion,
                "${MediaStore.MediaColumns.RELATIVE_PATH}=? AND ${MediaStore.MediaColumns.DISPLAY_NAME}=?",
                arrayOf(rutaRelativa, nombre)
            )
            val valores = ContentValues().apply {
                put(MediaStore.MediaColumns.DISPLAY_NAME, nombre)
                put(MediaStore.MediaColumns.MIME_TYPE, "application/json")
                put(MediaStore.MediaColumns.RELATIVE_PATH, rutaRelativa)
            }
            val uri: Uri = activity.contentResolver.insert(coleccion, valores) ?: throw Exception("MediaStore no devolvió Uri")
            return activity.contentResolver.openOutputStream(uri) ?: throw Exception("sin flujo de salida")
        }
        val carpeta = File(activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), CARPETA_COPIA_AUTOMATICA)
        carpeta.mkdirs()
        return FileOutputStream(File(carpeta, nombre))
    }

    /** Conserva como máximo 7 copias automáticas — borra las más viejas por fecha en el nombre.
     * Mismo criterio que `nombresARotar` en js/respaldo-automatico.js (probado con node --test):
     * se listan los nombres propios (que matchean el patrón), se ordenan del más nuevo al más
     * viejo y se borran los que sobran del corte. */
    private fun rotarCopiasAutomaticas(maximo: Int = 7) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            val coleccion = MediaStore.Files.getContentUri("external")
            val rutaRelativa = "${Environment.DIRECTORY_DOCUMENTS}/$CARPETA_COPIA_AUTOMATICA/"
            val propios = mutableListOf<Pair<Long, String>>()
            activity.contentResolver.query(
                coleccion,
                arrayOf(MediaStore.MediaColumns._ID, MediaStore.MediaColumns.DISPLAY_NAME),
                "${MediaStore.MediaColumns.RELATIVE_PATH}=?",
                arrayOf(rutaRelativa),
                null
            )?.use { cursor ->
                val idxId = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns._ID)
                val idxNombre = cursor.getColumnIndexOrThrow(MediaStore.MediaColumns.DISPLAY_NAME)
                while (cursor.moveToNext()) {
                    val nombre = cursor.getString(idxNombre)
                    if (PATRON_NOMBRE_COPIA.matches(nombre)) propios.add(cursor.getLong(idxId) to nombre)
                }
            }
            val aBorrar = propios.sortedByDescending { it.second }.drop(maximo)
            for ((id, _) in aBorrar) {
                activity.contentResolver.delete(coleccion, "${MediaStore.MediaColumns._ID}=?", arrayOf(id.toString()))
            }
        } else {
            val carpeta = File(activity.getExternalFilesDir(Environment.DIRECTORY_DOCUMENTS), CARPETA_COPIA_AUTOMATICA)
            val archivos = carpeta.listFiles { _, nombre -> PATRON_NOMBRE_COPIA.matches(nombre) } ?: return
            archivos.sortedByDescending { it.name }.drop(maximo).forEach { it.delete() }
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
