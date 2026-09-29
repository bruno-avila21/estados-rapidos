// Foto de ejemplo propia del proyecto (assets/ejemplo.jpg): se usa como fallback cuando hace falta
// mostrar una miniatura en vivo (galería de presets de plantilla.js) y todavía no hay NINGÚN
// producto cargado (recién instalada) — antes de "Estilo de las imágenes" mudarse a Plantilla, esto
// vivía en ajustes.js ("ronda miniaturas con placeholder", CREAR-BRIEF.md 2026-09-28). Movido acá
// (ronda "orden del diseño", 2026-09-29) para que cualquier pantalla con miniaturas en vivo lo
// reuse sin importar código muerto. Decodificada una sola vez y reusada mientras dure la pestaña.
let bitmapEjemploPorDefecto = null;

export async function fotoDeEjemploPorDefecto() {
  if (bitmapEjemploPorDefecto) return bitmapEjemploPorDefecto;
  try {
    const respuesta = await fetch('assets/ejemplo.jpg');
    const blob = await respuesta.blob();
    bitmapEjemploPorDefecto = await createImageBitmap(blob);
  } catch {
    bitmapEjemploPorDefecto = null;
  }
  return bitmapEjemploPorDefecto;
}
