// Apariencia de la app (pedido 2026-10-07): modo (automático/claro/oscuro) y tono del color
// primario. Es una preferencia de ESTE celular, no un dato del catálogo: va a localStorage (hace
// falta leerla sincrónicamente antes del primer pintado, ver js/tema-inicial.js) y no entra en el
// respaldo. Los colores de cada tono están en css/estilos.css (`[data-tono='…']`).
const CLAVE = 'estados-rapidos:tema';

export const MODOS = Object.freeze({ auto: 'Automático', claro: 'Claro', oscuro: 'Oscuro' });
export const TONOS = Object.freeze({
  cipres: 'Ciprés',
  oceano: 'Océano',
  terracota: 'Terracota',
  ciruela: 'Ciruela',
  grafito: 'Grafito',
});
const FONDO = { claro: '#fbf9f5', oscuro: '#201e1a' };

/** Normaliza lo que haya guardado (o nada) a un tema válido. Pura. */
export function normalizarTema(crudo) {
  return {
    modo: Object.hasOwn(MODOS, crudo?.modo) ? crudo.modo : 'auto',
    tono: Object.hasOwn(TONOS, crudo?.tono) ? crudo.tono : 'cipres',
  };
}

export function leerTema() {
  try {
    return normalizarTema(JSON.parse(localStorage.getItem(CLAVE) || '{}'));
  } catch {
    return normalizarTema(null);
  }
}

/** Pone los atributos en <html> y el color de la barra del sistema. */
export function aplicarTema(tema = leerTema()) {
  const raiz = document.documentElement;
  if (tema.modo === 'auto') raiz.removeAttribute('data-theme');
  else raiz.setAttribute('data-theme', tema.modo === 'oscuro' ? 'dark' : 'light');
  if (tema.tono === 'cipres') raiz.removeAttribute('data-tono');
  else raiz.setAttribute('data-tono', tema.tono);
  document.querySelectorAll('meta[name="theme-color"]').forEach((meta) => {
    const delSistema = meta.media.includes('dark') ? FONDO.oscuro : FONDO.claro;
    meta.content = tema.modo === 'auto' ? delSistema : FONDO[tema.modo];
  });
}

/** Guarda un cambio parcial (`{ modo }` o `{ tono }`) y lo aplica al toque. */
export function guardarTema(cambio) {
  const tema = normalizarTema({ ...leerTema(), ...cambio });
  try {
    localStorage.setItem(CLAVE, JSON.stringify(tema));
  } catch {
    // sin almacenamiento: vale para esta sesión
  }
  aplicarTema(tema);
  return tema;
}
