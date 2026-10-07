package com.estadosrapidos.app

// Una WebView con estados-rapidos embebido (assets/app). Sin backend, sin red: todo el dato
// vive en el IndexedDB del teléfono. Se sirve por https://appassets.androidplatform.net/ y NUNCA
// por file://, para que IndexedDB y localStorage funcionen como en un sitio normal (skill
// crear-apk, BUGS #8).

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import java.io.File
import java.util.concurrent.Executors

// Fotos que otra app le compartió a esta ("Compartir" desde la galería): ya copiadas a
// cache/compartidas y a la espera de que el JS las pida (PuenteArchivos.fotosCompartidas()).
object FotosCompartidas {
    const val CARPETA = "compartidas"
    const val URL_BASE = "https://appassets.androidplatform.net/compartidas/"
    private val pendientes = ArrayList<String>()

    @Synchronized fun sumar(urls: List<String>) { pendientes.addAll(urls) }

    @Synchronized fun tomar(): List<String> {
        val copia = ArrayList(pendientes)
        pendientes.clear()
        return copia
    }
}

class PantallaPrincipal : AppCompatActivity() {
    private lateinit var web: WebView

    // --- Selector de archivos genérico: galería (foto) y elegir .json (Respaldo → Importar).
    // Sin esto un <input type="file"> no abre nada dentro de un WebView (skill BUGS #7).
    private var callbackArchivo: ValueCallback<Array<Uri>>? = null
    private val selectorArchivo: ActivityResultLauncher<Intent> =
        registerForActivityResult(ActivityResultContracts.StartActivityForResult()) { resultado ->
            val cb = callbackArchivo
            callbackArchivo = null
            cb?.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultado.resultCode, resultado.data))
        }

    // --- Cámara: el <input capture="environment"> pide la foto directo, no un chooser.
    private var uriCamaraPendiente: Uri? = null
    private val tomarFoto: ActivityResultLauncher<Uri> =
        registerForActivityResult(ActivityResultContracts.TakePicture()) { exito ->
            val cb = callbackArchivo
            callbackArchivo = null
            val uri = uriCamaraPendiente
            uriCamaraPendiente = null
            cb?.onReceiveValue(if (exito && uri != null) arrayOf(uri) else null)
        }
    private val permisoCamara: ActivityResultLauncher<String> =
        registerForActivityResult(ActivityResultContracts.RequestPermission()) { concedido ->
            if (concedido) lanzarCamara()
            else {
                callbackArchivo?.onReceiveValue(null)
                callbackArchivo = null
            }
        }

    override fun onCreate(estado: Bundle?) {
        super.onCreate(estado)
        // Edge-to-edge: la web ocupa toda la pantalla; el CSS ya maneja el safe-area
        // (viewport-fit=cover + env(safe-area-inset-*)).
        enableEdgeToEdge()

        // Carpetas de trabajo del puente de archivos, limpias en cada arranque (no acumular
        // fotos compartidas o capturadas de sesiones viejas).
        File(cacheDir, "compartir").let { it.deleteRecursively(); it.mkdirs() }
        File(cacheDir, "camara").let { it.deleteRecursively(); it.mkdirs() }
        if (estado == null) File(cacheDir, FotosCompartidas.CARPETA).let { it.deleteRecursively(); it.mkdirs() }

        // Solo en debug: deja inspeccionar la WebView por chrome://inspect / CDP remoto
        // (medir scrollWidth con font_scale y densidad alterados). El release no la toca.
        if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)

        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#fbf9f5")) // = --color-fondo, evita el flash blanco
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true   // localStorage
        web.settings.databaseEnabled = true      // IndexedDB (productos, fotos, plantilla)
        web.settings.allowFileAccess = false     // no hace falta: todo entra por appassets/el picker
        web.settings.mediaPlaybackRequiresUserGesture = false

        web.webChromeClient = object : WebChromeClient() {
            override fun onShowFileChooser(
                vista: WebView?,
                callback: ValueCallback<Array<Uri>>?,
                params: FileChooserParams?
            ): Boolean {
                callbackArchivo?.onReceiveValue(null)
                callbackArchivo = callback

                // "Cámara" en el alta de producto: <input type=file capture="environment">.
                if (params?.isCaptureEnabled == true) {
                    val tienePermiso = ContextCompat.checkSelfPermission(
                        this@PantallaPrincipal, Manifest.permission.CAMERA
                    ) == PackageManager.PERMISSION_GRANTED
                    if (tienePermiso) lanzarCamara() else permisoCamara.launch(Manifest.permission.CAMERA)
                    return true
                }

                // "Galería" y "Elegir archivo…" (Respaldo → Importar .json): selector normal.
                val intent = params?.createIntent()
                if (intent == null) { callbackArchivo = null; return false }
                return try {
                    selectorArchivo.launch(intent)
                    true
                } catch (e: Exception) {
                    callbackArchivo = null
                    false
                }
            }
        }
        setContentView(web)

        val cargador = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            // Las fotos compartidas desde la galería se sirven por el MISMO origen que la app: el
            // JS las baja con fetch() como cualquier archivo propio (la CSP no deja otro origen).
            .addPathHandler(
                "/" + FotosCompartidas.CARPETA + "/",
                WebViewAssetLoader.InternalStoragePathHandler(this, File(cacheDir, FotosCompartidas.CARPETA))
            )
            .build()
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(v: WebView, req: WebResourceRequest): WebResourceResponse? =
                cargador.shouldInterceptRequest(req.url)
        }

        // Atrás: la SPA es por hash y la hoja de revisión usa history.pushState/popstate (ya se
        // cierra sola con el gesto). Igual le preguntamos al JS por si hace falta un paso más
        // antes de salir de la app (patrón de la skill, BUGS #10): si no hay nada que cerrar,
        // recién ahí sale.
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                web.evaluateJavascript("window.estadosRapidosBack ? window.estadosRapidosBack() : false") { resultado ->
                    if (resultado != "true") {
                        isEnabled = false
                        onBackPressedDispatcher.onBackPressed()
                    }
                }
            }
        })

        web.addJavascriptInterface(PuenteArchivos(this, web), "Android")

        if (estado == null) {
            // Si la app se abrió PORQUE le compartieron fotos, se copian ya: el JS las pide al arrancar.
            recibirCompartidas(intent)
            web.loadUrl("https://appassets.androidplatform.net/assets/app/index.html")
        } else {
            web.restoreState(estado)
        }
    }

    // La app ya estaba abierta y le comparten fotos (launchMode singleTask).
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        recibirCompartidas(intent)
    }

    private val hiloCompartidas = Executors.newSingleThreadExecutor()

    // Copia las imágenes del "Compartir" a cache/compartidas (el permiso sobre esas Uri es
    // temporal: hay que leerlas ahora) y le avisa al JS, que las abre en "Agregar varios".
    private fun recibirCompartidas(intent: Intent?) {
        if (intent == null) return
        val tipo = intent.type ?: return
        if (!tipo.startsWith("image/")) return
        val uris = ArrayList<Uri>()
        @Suppress("DEPRECATION")
        when (intent.action) {
            Intent.ACTION_SEND -> intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.add(it) }
            Intent.ACTION_SEND_MULTIPLE -> intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)?.let { uris.addAll(it) }
            else -> return
        }
        if (uris.isEmpty()) return
        // Para que una recreación de la Activity no vuelva a importar las mismas fotos.
        intent.action = Intent.ACTION_MAIN
        hiloCompartidas.execute {
            val carpeta = File(cacheDir, FotosCompartidas.CARPETA).apply { mkdirs() }
            val marca = System.currentTimeMillis()
            val urls = ArrayList<String>()
            uris.forEachIndexed { indice, uri ->
                try {
                    val nombre = "c_${marca}_$indice.jpg"
                    contentResolver.openInputStream(uri)?.use { entrada ->
                        File(carpeta, nombre).outputStream().use { salida -> entrada.copyTo(salida) }
                    } ?: return@forEachIndexed
                    urls.add(FotosCompartidas.URL_BASE + nombre)
                } catch (e: Exception) {
                    // esa foto no se pudo leer: se sigue con las demás
                }
            }
            if (urls.isEmpty()) return@execute
            FotosCompartidas.sumar(urls)
            runOnUiThread {
                // Si la página todavía no cargó, la función no existe y no pasa nada: main.js las
                // pide solo al arrancar.
                web.evaluateJavascript(
                    "window.estadosRapidosFotosCompartidas && window.estadosRapidosFotosCompartidas()", null
                )
            }
        }
    }

    private fun lanzarCamara() {
        val carpeta = File(cacheDir, "camara").apply { mkdirs() }
        val archivo = File(carpeta, "foto_${System.currentTimeMillis()}.jpg")
        val uri = FileProvider.getUriForFile(this, "$packageName.archivos", archivo)
        uriCamaraPendiente = uri
        try {
            tomarFoto.launch(uri)
        } catch (e: Exception) {
            callbackArchivo?.onReceiveValue(null)
            callbackArchivo = null
            uriCamaraPendiente = null
        }
    }

    override fun onSaveInstanceState(out: Bundle) { super.onSaveInstanceState(out); web.saveState(out) }

    override fun onDestroy() { web.destroy(); super.onDestroy() }
}
