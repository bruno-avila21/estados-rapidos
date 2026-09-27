// Carga de las 6 tipografías OFL autoalojadas (fonts/*.woff2) con FontFace, ANTES de dibujar en
// canvas: si el canvas dibuja antes de que la fuente esté lista, usa la de sistema y no se puede
// corregir después (no hay "reflow" de canvas). Nada de Google Fonts remoto: la CSP no lo deja
// (font-src 'self') y así funciona offline. Ver CREAR-BRIEF.md 2026-09-27.
// Cada clave del modelo (FUENTES_DISPONIBLES, en modelo.js) -> familia CSS/canvas + los pesos reales que se
// autoalojaron. Inter/Montserrat/Poppins tienen 2 pesos reales (no negrita sintética); las otras 3
// son de un solo peso (el navegador la hace "bold" sintética si se pide 700 y no está cargado).
export const REGISTRO_FUENTES = Object.freeze({
  inter: { family: 'EstadoInter', pesos: { 400: 'inter-400.woff2', 700: 'inter-700.woff2' } },
  montserrat: { family: 'EstadoMontserrat', pesos: { 400: 'montserrat-400.woff2', 700: 'montserrat-700.woff2' } },
  poppins: { family: 'EstadoPoppins', pesos: { 400: 'poppins-400.woff2', 600: 'poppins-600.woff2' } },
  playfair: { family: 'EstadoPlayfair', pesos: { 700: 'playfair-700.woff2' } },
  'bebas-neue': { family: 'EstadoBebas', pesos: { 400: 'bebas-neue-400.woff2' } },
  pacifico: { family: 'EstadoPacifico', pesos: { 400: 'pacifico-400.woff2' } },
});

/** Nombre de familia CSS/canvas para una clave de FUENTES_DISPONIBLES (con fallback de sistema). */
export function familiaCanvas(clave) {
  const entrada = REGISTRO_FUENTES[clave];
  if (!entrada) return 'system-ui, sans-serif';
  return `${entrada.family}, system-ui, sans-serif`;
}

let promesaCarga = null;

/** Carga las 6 fuentes (todos sus pesos reales) una sola vez y espera a que estén listas. */
export function cargarFuentes() {
  if (promesaCarga) return promesaCarga;
  if (typeof FontFace === 'undefined' || typeof document === 'undefined') {
    promesaCarga = Promise.resolve([]); // entorno sin FontFace (ej. node --test): no-op
    return promesaCarga;
  }
  const tareas = [];
  for (const { family, pesos } of Object.values(REGISTRO_FUENTES)) {
    for (const [peso, archivo] of Object.entries(pesos)) {
      tareas.push(
        (async () => {
          try {
            const cara = new FontFace(family, `url(./fonts/${archivo})`, { weight: peso });
            await cara.load();
            document.fonts.add(cara);
            return true;
          } catch {
            return false; // ese peso en particular no cargó: se sigue con los demás
          }
        })()
      );
    }
  }
  promesaCarga = Promise.all(tareas);
  return promesaCarga;
}
