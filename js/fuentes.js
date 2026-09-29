// Carga de las 6 tipografías OFL autoalojadas (fonts/*.woff2) con FontFace, ANTES de dibujar en
// canvas: si el canvas dibuja antes de que la fuente esté lista, usa la de sistema y no se puede
// corregir después (no hay "reflow" de canvas). Nada de Google Fonts remoto: la CSP no lo deja
// (font-src 'self') y así funciona offline. Ver CREAR-BRIEF.md 2026-09-27.
// Cada clave del modelo (FUENTES_DISPONIBLES, en modelo.js) -> familia CSS/canvas + los pesos reales que se
// autoalojaron. Inter/Montserrat/Poppins tienen 2 pesos reales (no negrita sintética); las otras 3
// son de un solo peso (el navegador la hace "bold" sintética si se pide 700 y no está cargado).
// `newsreader`/`manrope` se suman en la ronda "4 presets calzan con los mocks" (2026-09-29): son las
// tipografías de los 4 presets de composición (serif de títulos/precio + sans de cuerpo/labels,
// igual que los mocks Stitch organic_minimalist) — autoalojadas igual que las 6 de antes, NUNCA
// Google Fonts remoto (CSP). Los .woff2 400/500/600 ya estaban en fonts/ (los usa la UI vía
// @font-face en css/estilos.css); acá se suman los pesos que faltaban (700, itálica 400) para el
// canvas, bajados de @fontsource vía jsdelivr. No están en `FUENTES_DISPONIBLES` (modelo.js): esas
// son las 6 elegibles a mano en el editor de plantilla; estas dos son de USO INTERNO de los presets
// (fijas por diseño, no elegibles), por eso el registro de acá abajo tiene más entradas que
// `FUENTES_DISPONIBLES`. `newsreader-italica` es una familia CSS aparte (no un peso): así
// `familiaCanvas('newsreader-italica')` da directo el `font-style: italic` real (Polaroid) sin
// depender de la itálica sintética del navegador.
export const REGISTRO_FUENTES = Object.freeze({
  inter: { family: 'EstadoInter', pesos: { 400: 'inter-400.woff2', 700: 'inter-700.woff2' } },
  montserrat: { family: 'EstadoMontserrat', pesos: { 400: 'montserrat-400.woff2', 700: 'montserrat-700.woff2' } },
  poppins: { family: 'EstadoPoppins', pesos: { 400: 'poppins-400.woff2', 600: 'poppins-600.woff2' } },
  playfair: { family: 'EstadoPlayfair', pesos: { 700: 'playfair-700.woff2' } },
  'bebas-neue': { family: 'EstadoBebas', pesos: { 400: 'bebas-neue-400.woff2' } },
  pacifico: { family: 'EstadoPacifico', pesos: { 400: 'pacifico-400.woff2' } },
  newsreader: {
    family: 'EstadoNewsreader',
    pesos: { 400: 'newsreader-400.woff2', 500: 'newsreader-500.woff2', 700: 'newsreader-700.woff2' },
  },
  'newsreader-italica': {
    family: 'EstadoNewsreaderItalica',
    estilo: 'italic',
    pesos: { 400: 'newsreader-400-italic.woff2' },
  },
  manrope: {
    family: 'EstadoManrope',
    pesos: { 400: 'manrope-400.woff2', 600: 'manrope-600.woff2', 700: 'manrope-700.woff2' },
  },
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
  for (const { family, pesos, estilo } of Object.values(REGISTRO_FUENTES)) {
    for (const [peso, archivo] of Object.entries(pesos)) {
      tareas.push(
        (async () => {
          try {
            const cara = new FontFace(family, `url(./fonts/${archivo})`, { weight: peso, style: estilo || 'normal' });
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
