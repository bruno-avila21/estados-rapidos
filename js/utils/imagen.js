// Redimensionar/comprimir fotos antes de guardarlas en IndexedDB (máx. 1600px lado mayor, JPEG 0.85).
export const LADO_MAXIMO = 1600;
export const CALIDAD_JPEG = 0.85;

export async function achicarFoto(archivoOBlob, { ladoMaximo = LADO_MAXIMO, calidad = CALIDAD_JPEG } = {}) {
  const bitmap = await createImageBitmap(archivoOBlob);
  const escala = Math.min(1, ladoMaximo / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala));
  const h = Math.max(1, Math.round(bitmap.height * escala));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();
  return await new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('No se pudo procesar la foto.'))), 'image/jpeg', calidad);
  });
}

export function blobABase64(blob) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => resolve(lector.result);
    lector.onerror = () => reject(lector.error);
    lector.readAsDataURL(blob);
  });
}

/**
 * Decodifica un data URL ("data:image/png;base64,....") a Blob a mano, con `atob`, en vez de
 * `fetch(dataUrl)` — BUGS.md #26: dentro del WebView empaquetado del APK, importar un respaldo con
 * `fotoBase64` armado a mano dejaba el producto sin foto (silencioso: ni el import ni el `<img>`
 * tiraban error visible). `fetch` sobre esquema `data:` depende del motor; decodificar el base64
 * directo es portable en cualquier entorno con `atob`/`Uint8Array` (navegador, WebView y Node 18+).
 */
export async function base64ABlob(dataUrl) {
  const separador = dataUrl.indexOf(',');
  const encabezado = separador >= 0 ? dataUrl.slice(0, separador) : '';
  const base64 = separador >= 0 ? dataUrl.slice(separador + 1) : dataUrl;
  const tipo = /data:([^;,]+)/.exec(encabezado)?.[1] || 'application/octet-stream';

  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i += 1) bytes[i] = binario.charCodeAt(i);
  return new Blob([bytes], { type: tipo });
}
