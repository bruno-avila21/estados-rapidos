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
 * Compartir uno o varios archivos de imagen. En el APK, cada Blob se pasa al puente nativo APENAS
 * está listo (`Android.guardarParaCompartir(indice, dataUrl)`, uno por vez, en orden) y recién al
 * final se dispara el chooser (`Android.compartirPreparadas(texto)`) — no se arma un JSON con el
 * base64 de TODAS las imágenes juntas en memoria antes de mandar nada (con 10 fotos era una string
 * de varios MB; ronda "publicar más rápido", CREAR-BRIEF.md 2026-09-28). Nunca lanza: si algo
 * falla, el error queda en la consola y quien llama decide el fallback (compartir.js ya sabe caer
 * a `navigator.share` / descarga si esto no aplica).
 * @param {{archivos: File[], texto?: string}} datos
 */
export async function compartirImagenesApk({ archivos, texto = '' }) {
  for (let i = 0; i < archivos.length; i += 1) {
    // eslint-disable-next-line no-await-in-loop -- cada archivo se lee y se manda al puente apenas
    // está listo, uno detrás del otro: es justamente la idea (evitar juntar todo antes de mandar).
    const dataUrl = await archivoADataUrl(archivos[i]);
    window.Android.guardarParaCompartir(i, dataUrl);
  }
  window.Android.compartirPreparadas(texto);
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
