// Lógica pura de reordenamiento (Fase 3 "M" #1, hoja de revisión): mover un producto de una
// posición a otra. Nada de DOM ni de IndexedDB acá — se prueba con node:test (test/reordenar.test.js)
// y la usan tanto el arrastre con el dedo (pointer events, la API HTML5 drag NO anda en Android
// WebView) como la alternativa accesible (botones "Mover antes"/"Mover después").

/**
 * Devuelve una COPIA de `lista` con el elemento en `desde` movido a la posición `hasta`.
 * Índices fuera de rango se recortan al límite válido (nunca tira, nunca pierde elementos) —
 * mismo criterio defensivo que el resto del modelo ante datos/gestos inesperados.
 */
export function moverElemento(lista, desde, hasta) {
  if (!Array.isArray(lista) || lista.length === 0) return [];
  const largo = lista.length;
  const d = Math.max(0, Math.min(Math.trunc(desde), largo - 1));
  const h = Math.max(0, Math.min(Math.trunc(hasta), largo - 1));
  const copia = lista.slice();
  if (d === h || Number.isNaN(d) || Number.isNaN(h)) return copia;
  const [elemento] = copia.splice(d, 1);
  copia.splice(h, 0, elemento);
  return copia;
}

/**
 * Índice de destino durante un arrastre: a qué posición correspondería soltar según la
 * coordenada X del puntero (`x`) y los centros X actuales de cada "slot" (`centros`, capturados
 * una sola vez al empezar el arrastre — los slots no cambian de ancho mientras se reordena).
 * Mismo criterio en mouse y touch: no depende de la API HTML5 `dragstart`/`dragover`.
 */
export function indiceDesdePosicion(centros, x) {
  if (!Array.isArray(centros) || centros.length === 0) return 0;
  for (let i = 0; i < centros.length; i += 1) {
    if (x < centros[i]) return i;
  }
  return centros.length - 1;
}
