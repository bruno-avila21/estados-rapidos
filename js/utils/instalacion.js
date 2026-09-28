// Instalar/compartir la app (CREAR-BRIEF.md: "la van a usar compañeros de trabajo"). Captura
// `beforeinstallprompt` apenas se puede: el navegador lo dispara UNA sola vez por carga y si nadie
// escucha en ese momento se pierde, así que este módulo se importa bien temprano desde main.js
// (antes de que se navegue a Ajustes) y guarda el evento para cuando la UI lo pida.
let eventoDiferido = null;
let yaInstalada = false;

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (evento) => {
    evento.preventDefault(); // frena el mini-infobar automático de Chrome: el botón propio decide cuándo
    eventoDiferido = evento;
  });
  window.addEventListener('appinstalled', () => {
    yaInstalada = true;
    eventoDiferido = null;
  });
}

/** true si la app ya corre "instalada" (standalone), sea cual sea el navegador/SO. */
export function estaInstalada() {
  if (yaInstalada) return true;
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator?.standalone === true;
}

/** true si el navegador ofreció el prompt nativo (Chrome/Edge Android) y todavía no se usó. */
export function hayPromptDeInstalacion() {
  return !!eventoDiferido;
}

/**
 * Dispara el prompt nativo de instalación (solo se puede usar una vez por evento capturado).
 * @returns {Promise<'accepted'|'dismissed'|null>} null si no había prompt disponible.
 */
export async function solicitarInstalacion() {
  if (!eventoDiferido) return null;
  const evento = eventoDiferido;
  eventoDiferido = null;
  evento.prompt();
  const eleccion = await evento.userChoice;
  return eleccion?.outcome ?? null;
}

/** El link canónico de esta instalación (sirve igual si se muda de GitHub Pages a Cloudflare). */
export function linkDeLaApp() {
  return location.origin + location.pathname;
}
