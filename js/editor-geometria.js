// Geometría pura del editor de plantilla: hit-testing, mover/redimensionar con límites, snap a
// centro/márgenes. Sin DOM ni canvas — testeable con node:test. El editor visual (js/vistas/
// editor.js) traduce eventos de puntero a llamadas a estas funciones.

/**
 * Qué elemento hay en el punto (x,y) del lienzo. `cajas` va de atrás hacia adelante (el último
 * que contiene el punto es el que está "arriba" y se devuelve). Ignora cajas con `visible:false`.
 * @param {Array<{clave:string,x:number,y:number,w:number,h:number,visible?:boolean}>} cajas
 */
export function elementoEnPunto(cajas, x, y) {
  for (let i = cajas.length - 1; i >= 0; i -= 1) {
    const c = cajas[i];
    if (c.visible === false) continue;
    if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) return c.clave;
  }
  return null;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/** Mueve una caja por (dx,dy), sin dejarla salir del lienzo (`limites: {w,h}`). */
export function moverCaja(caja, dx, dy, limites) {
  const x = clamp(caja.x + dx, 0, Math.max(0, limites.w - caja.w));
  const y = clamp(caja.y + dy, 0, Math.max(0, limites.h - caja.h));
  return { ...caja, x, y };
}

/**
 * Redimensiona arrastrando una manija de esquina ('ne'|'nw'|'se'|'sw'), con un mínimo de tamaño
 * y sin salir del lienzo.
 */
export function redimensionarCaja(caja, manija, dx, dy, limites, minimo = 40) {
  let { x, y, w, h } = caja;
  if (manija.includes('e')) {
    w = clamp(w + dx, minimo, limites.w - x);
  }
  if (manija.includes('s')) {
    h = clamp(h + dy, minimo, limites.h - y);
  }
  if (manija.includes('w')) {
    const nuevaX = clamp(x + dx, 0, x + w - minimo);
    w += x - nuevaX;
    x = nuevaX;
  }
  if (manija.includes('n')) {
    const nuevaY = clamp(y + dy, 0, y + h - minimo);
    h += y - nuevaY;
    y = nuevaY;
  }
  return { ...caja, x, y, w, h };
}

/**
 * Snap suave: si el centro de la caja está a `umbral` px del centro del lienzo, o un borde está a
 * `umbral` px de un margen, la ajusta exacto y devuelve qué guías quedaron activas (para
 * dibujarlas). No modifica w/h, solo x/y.
 */
export function aplicarSnap(caja, limites, umbral = 12) {
  let { x, y } = caja;
  const guias = [];

  const centroXCaja = caja.x + caja.w / 2;
  const centroYCaja = caja.y + caja.h / 2;
  const centroXLimite = limites.w / 2;
  const centroYLimite = limites.h / 2;

  if (Math.abs(centroXCaja - centroXLimite) <= umbral) {
    x = centroXLimite - caja.w / 2;
    guias.push('centro-x');
  } else if (Math.abs(caja.x) <= umbral) {
    x = 0;
    guias.push('margen-izquierdo');
  } else if (Math.abs(limites.w - (caja.x + caja.w)) <= umbral) {
    x = limites.w - caja.w;
    guias.push('margen-derecho');
  }

  if (Math.abs(centroYCaja - centroYLimite) <= umbral) {
    y = centroYLimite - caja.h / 2;
    guias.push('centro-y');
  } else if (Math.abs(caja.y) <= umbral) {
    y = 0;
    guias.push('margen-superior');
  } else if (Math.abs(limites.h - (caja.y + caja.h)) <= umbral) {
    y = limites.h - caja.h;
    guias.push('margen-inferior');
  }

  return { caja: { ...caja, x, y }, guias };
}

/**
 * "Acomodar automáticamente" (CREAR-BRIEF.md, ronda distribución): apila los elementos dados
 * centrados horizontalmente, de abajo hacia arriba — el ÚLTIMO de `elementos` queda más cerca del
 * margen inferior, y cada uno anterior se apoya sobre el siguiente con `separacion` de por medio.
 * Respeta el alto (`h`) y ancho (`w`) de cada uno; solo calcula `x`/`y`. Pura: no toca `ajustes` ni
 * el DOM — quien llama decide qué hacer con el resultado (aplicarlo, sumarlo al historial).
 * @param {Array<{clave:string, w:number, h:number}>} elementos en el orden visual de arriba hacia
 *   abajo (p. ej. nombre, precio, descripción); solo se pasan los VISIBLES.
 * @param {{ancho?:number, alto?:number, margenInferior?:number, separacion?:number}} [opciones]
 * @returns {Record<string, {x:number, y:number}>}
 */
export function acomodarAutomatico(elementos, opciones = {}) {
  const { ancho = 1080, alto = 1920, margenInferior = 120, separacion = 24 } = opciones;
  const resultado = {};
  let bordeInferior = alto - margenInferior;
  for (let i = elementos.length - 1; i >= 0; i -= 1) {
    const { clave, w, h } = elementos[i];
    const y = bordeInferior - h;
    const x = (ancho - w) / 2;
    resultado[clave] = { x, y };
    bordeInferior = y - separacion;
  }
  return resultado;
}
