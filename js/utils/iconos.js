// Íconos SVG inline de línea (1.5px, sin relleno) — reemplazan los glifos unicode/emoji de la
// piel anterior. Dirección "Organic Minimalist" (ver Interfaz/ANALISIS-STITCH.md): "Iconographic
// Discipline" prohíbe emojis y exige vectores propios, nunca una fuente de íconos remota. Se
// construyen con las mismas primitivas DOM que el resto de js/vistas/*.js (nada de innerHTML).
const NS = 'http://www.w3.org/2000/svg';

// Cada trazo es [tagSvg, atributos]. Coordenadas en un viewBox 0 0 24 24, todas rectas o arcos
// chicos: nada de curvas complejas, para poder revisar a ojo que el ícono cierra bien.
const TRAZOS = Object.freeze({
  lista: [
    ['line', { x1: 4, y1: 6, x2: 20, y2: 6 }],
    ['line', { x1: 4, y1: 12, x2: 20, y2: 12 }],
    ['line', { x1: 4, y1: 18, x2: 20, y2: 18 }],
  ],
  grilla: [
    ['rect', { x: 4, y: 4, width: 7, height: 7, rx: 1.5 }],
    ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 1.5 }],
    ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.5 }],
    ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 1.5 }],
  ],
  ajustes: [
    ['line', { x1: 4, y1: 6, x2: 20, y2: 6 }],
    ['circle', { cx: 9, cy: 6, r: 2 }],
    ['line', { x1: 4, y1: 12, x2: 20, y2: 12 }],
    ['circle', { cx: 15, cy: 12, r: 2 }],
    ['line', { x1: 4, y1: 18, x2: 20, y2: 18 }],
    ['circle', { cx: 11, cy: 18, r: 2 }],
  ],
  respaldo: [
    ['line', { x1: 9, y1: 4, x2: 9, y2: 13 }],
    ['polyline', { points: '6,7 9,4 12,7' }],
    ['line', { x1: 15, y1: 20, x2: 15, y2: 11 }],
    ['polyline', { points: '12,17 15,20 18,17' }],
  ],
  buscar: [
    ['circle', { cx: 10, cy: 10, r: 6 }],
    ['line', { x1: 14.5, y1: 14.5, x2: 20, y2: 20 }],
  ],
  vacio: [
    ['circle', { cx: 12, cy: 12, r: 8 }],
    ['line', { x1: 8, y1: 12, x2: 16, y2: 12 }],
  ],
  etiqueta: [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }],
    ['circle', { cx: 9, cy: 9, r: 1.6 }],
  ],
  camara: [
    ['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }],
    ['path', { d: 'M8 7l2-3h4l2 3' }],
    ['circle', { cx: 12, cy: 13.5, r: 3.5 }],
  ],
  subir: [
    ['line', { x1: 12, y1: 4, x2: 12, y2: 15 }],
    ['polyline', { points: '8,8 12,4 16,8' }],
    ['path', { d: 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }],
  ],
  borrar: [
    ['line', { x1: 4, y1: 7, x2: 20, y2: 7 }],
    ['path', { d: 'M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7' }],
    ['path', { d: 'M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3' }],
    ['line', { x1: 10, y1: 11, x2: 10, y2: 17 }],
    ['line', { x1: 14, y1: 11, x2: 14, y2: 17 }],
  ],
  volver: [['polyline', { points: '15,6 9,12 15,18' }]],
  deshacer: [
    ['polyline', { points: '9,7 4,12 9,17' }],
    ['path', { d: 'M4 12h11a5 5 0 0 1 0 10h-1' }],
  ],
  rehacer: [
    ['polyline', { points: '15,7 20,12 15,17' }],
    ['path', { d: 'M20 12H9a5 5 0 0 0 0 10h1' }],
  ],
  ojo: [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  'ojo-tachado': [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['line', { x1: 3, y1: 3, x2: 21, y2: 21 }],
  ],
  'flecha-arriba': [['polyline', { points: '6,15 12,9 18,15' }]],
  'flecha-abajo': [['polyline', { points: '6,9 12,15 18,9' }]],
});

/**
 * Crea un <svg class="icono" aria-hidden="true"> de línea para reemplazar un emoji/glifo.
 * `nombre` tiene que existir en TRAZOS (si no, devuelve un <svg> vacío en vez de romper el
 * render — mismo criterio defensivo que el resto de la app ante datos inesperados).
 */
export function crearIcono(nombre, { clase = 'icono' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (clase) svg.setAttribute('class', clase);
  for (const [tag, attrs] of TRAZOS[nombre] ?? []) {
    const el = document.createElementNS(NS, tag);
    for (const [clave, valor] of Object.entries(attrs)) el.setAttribute(clave, String(valor));
    svg.append(el);
  }
  return svg;
}
