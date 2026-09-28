// Puente único hacia el APK (window.Android, inyectado por PuenteArchivos.kt). En el navegador
// ese objeto no existe, así que la app entera sigue funcionando igual: cada función de acá
// elige el camino nativo si hay puente, o el estándar web si no lo hay.
//
// No revisar `typeof Android !== 'undefined'` desde este módulo directamente en cada llamador:
// centralizado acá para que el día que cambie el nombre del puente, cambie en un solo lugar.

export function enApk() {
  return typeof window !== 'undefined' && typeof window.Android !== 'undefined' && window.Android !== null;
}

/**
 * Compartir uno o varios archivos de imagen. En el APK convierte cada Blob a dataURL (base64)
 * y se los pasa al puente nativo, que arma el Intent.ACTION_SEND(_MULTIPLE) con el chooser de
 * Android. Nunca lanza: si algo falla, el error queda en la consola y quien llama decide el
 * fallback (compartir.js ya sabe caer a `navigator.share` / descarga si esto no aplica).
 * @param {{archivos: File[], texto?: string}} datos
 */
export async function compartirImagenesApk({ archivos, texto = '' }) {
  const dataUrls = await Promise.all(archivos.map(archivoADataUrl));
  window.Android.compartirImagenes(JSON.stringify(dataUrls), texto);
}

function archivoADataUrl(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error || new Error('No se pudo leer el archivo'));
    lector.readAsDataURL(archivo);
  });
}

/** Copiar al portapapeles. En el APK, `navigator.clipboard` puede fallar dentro del WebView. */
export async function copiarTexto(texto) {
  if (enApk()) {
    window.Android.copiar(texto);
    return true;
  }
  await navigator.clipboard.writeText(texto);
  return true;
}

/**
 * Guardar un archivo de texto (hoy: el respaldo .json). En el navegador es la descarga con
 * `<a download>`; en el APK, el usuario elige dónde con el selector del sistema (SAF).
 */
export function guardarArchivoApk({ nombre, mime, contenido }) {
  window.Android.guardarArchivo(nombre, mime, contenido);
}

/** El número de versión que muestra Ajustes → "La app" cuando corre empaquetada. */
export function versionApk() {
  if (!enApk() || typeof window.Android.version !== 'function') return null;
  try {
    return window.Android.version();
  } catch {
    return null;
  }
}
