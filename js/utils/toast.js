// Feedback no bloqueante en un [role=status] único (los tests lo leen por ahí).
let contenedor = null;
let temporizador = null;

function obtenerContenedor() {
  if (contenedor) return contenedor;
  contenedor = document.getElementById('toast');
  return contenedor;
}

export function mostrarToast(mensaje) {
  const el = obtenerContenedor();
  if (!el) return;
  el.textContent = mensaje;
  el.classList.add('toast--visible');
  clearTimeout(temporizador);
  temporizador = setTimeout(() => el.classList.remove('toast--visible'), 3200);
}
