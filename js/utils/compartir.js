// Publicar: copia la descripción al portapapeles y comparte el PNG con navigator.share.
// Si no hay soporte de archivos, cae a descargar la imagen. AbortError (cancelado) no es error.
import { mostrarToast } from './toast.js';

export async function copiarDescripcion(texto) {
  if (!texto) return false;
  try {
    await navigator.clipboard.writeText(texto);
    mostrarToast('Descripción copiada');
    return true;
  } catch {
    mostrarToast('No se pudo copiar la descripción');
    return false;
  }
}

export function puedeCompartirArchivos(archivo) {
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: [archivo] });
}

/**
 * @returns {Promise<'compartido'|'cancelado'|'sin-soporte'|'error'>}
 */
export async function publicarImagen({ blob, nombreArchivo = 'estado.png', texto = '' }) {
  await copiarDescripcion(texto);

  const archivo = new File([blob], nombreArchivo, { type: 'image/png' });

  if (!puedeCompartirArchivos(archivo)) return 'sin-soporte';

  try {
    await navigator.share({ files: [archivo], text: texto });
    return 'compartido';
  } catch (error) {
    if (error && error.name === 'AbortError') return 'cancelado';
    mostrarToast('No se pudo compartir la imagen');
    return 'error';
  }
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
