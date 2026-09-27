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

export async function base64ABlob(dataUrl) {
  const respuesta = await fetch(dataUrl);
  return await respuesta.blob();
}
