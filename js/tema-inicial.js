// Aplica el modo (claro/oscuro) y el tono guardados ANTES del primer pintado, para que la app no
// parpadee con el tema por defecto. Script clásico y sincrónico a propósito (los módulos se
// ejecutan después de parsear el HTML); la lógica completa vive en js/utils/tema.js.
(function () {
  try {
    var tema = JSON.parse(localStorage.getItem('estados-rapidos:tema') || '{}');
    var raiz = document.documentElement;
    if (tema.modo === 'claro') raiz.setAttribute('data-theme', 'light');
    if (tema.modo === 'oscuro' || tema.modo === 'negro') raiz.setAttribute('data-theme', 'dark');
    if (tema.modo === 'negro') raiz.setAttribute('data-negro', '');
    if (typeof tema.tono === 'string' && /^[a-z]+$/.test(tema.tono) && tema.tono !== 'cipres') raiz.setAttribute('data-tono', tema.tono);
  } catch (e) {
    // sin almacenamiento (modo privado, etc.): queda el tema por defecto
  }
})();
