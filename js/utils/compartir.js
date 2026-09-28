// Publicar: copia la descripción al portapapeles y comparte archivo(s) con navigator.share.
// Si no hay soporte, cae a descargar. AbortError (cancelado) no es error. Timeout de seguridad:
// el botón que llama nunca queda colgado esperando una hoja de compartir que no cierra nadie
// (QA.md 2026-09-27, hallazgo medio #6).
import { mostrarToast } from './toast.js';
import { enApk, copiarTexto, compartirImagenesApk } from './plataforma.js';

export const TIMEOUT_COMPARTIR_MS = 15000;

export async function copiarDescripcion(texto) {
  if (!texto) return false;
  try {
    await copiarTexto(texto);
    mostrarToast('Descripción copiada');
    return true;
  } catch {
    mostrarToast('No se pudo copiar la descripción');
    return false;
  }
}

/** @param {File[]} archivos */
export function puedeCompartirArchivos(archivos) {
  // En el APK el puente arma el Intent.ACTION_SEND(_MULTIPLE) él mismo: siempre puede,
  // sin importar cuántos archivos sean (a diferencia de navigator.canShare, que en algunos
  // navegadores no soporta varios archivos juntos).
  if (enApk()) return true;
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: archivos });
}

/**
 * Comparte uno o más archivos. Nunca deja al llamador esperando indefinidamente: si
 * `navigator.share` no resuelve dentro de `timeoutMs`, se devuelve igual (con aviso) para que la
 * UI se libere; la hoja del sistema operativo puede seguir abierta en segundo plano.
 * @param {{archivos: File[], texto?: string, timeoutMs?: number}} datos
 * @returns {Promise<'compartido'|'cancelado'|'tardando'|'sin-soporte'|'error'>}
 */
export async function compartirArchivos({ archivos, texto = '', timeoutMs = TIMEOUT_COMPARTIR_MS }) {
  if (!archivos?.length || !puedeCompartirArchivos(archivos)) return 'sin-soporte';

  if (enApk()) {
    try {
      await compartirImagenesApk({ archivos, texto });
      return 'compartido';
    } catch (error) {
      mostrarToast('No se pudo compartir: ' + error.message);
      return 'error';
    }
  }

  const compartiendo = navigator.share({ files: archivos, text: texto });
  let idTimeout;
  const timeout = new Promise((resolve) => {
    idTimeout = setTimeout(() => resolve('tardando'), timeoutMs);
  });

  try {
    const resultado = await Promise.race([compartiendo.then(() => 'compartido'), timeout]);
    if (resultado === 'tardando') mostrarToast('Se está compartiendo en segundo plano…');
    return resultado;
  } catch (error) {
    if (error && error.name === 'AbortError') {
      mostrarToast('Cancelaste antes de compartir');
      return 'cancelado';
    }
    mostrarToast('No se pudo compartir: ' + error.message);
    return 'error';
  } finally {
    clearTimeout(idTimeout);
  }
}

/** Atajo para publicar una sola imagen (uso: Publicar de una tarjeta de la lista). */
export async function publicarImagen({ blob, nombreArchivo = 'estado.png', texto = '' }) {
  await copiarDescripcion(texto);
  const archivo = new File([blob], nombreArchivo, { type: 'image/png' });
  return await compartirArchivos({ archivos: [archivo], texto });
}

export function descargarImagen(blob, nombreArchivo = 'estado.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
