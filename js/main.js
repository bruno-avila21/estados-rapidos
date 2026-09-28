// Bootstrap de la app: router por hash + registro del service worker + aviso de versión nueva.
// `instalacion.js` se importa primero (aunque no se use acá) para escuchar `beforeinstallprompt`
// desde el arranque: el navegador lo dispara una sola vez por carga y si no hay nadie escuchando
// en ese momento se pierde (Ajustes → "La app" lo necesita más tarde, cuando el usuario navegue ahí).
import './utils/instalacion.js';
import * as lista from './vistas/lista.js';
import * as detalle from './vistas/detalle.js';
import * as ajustes from './vistas/ajustes.js';
import * as plantilla from './vistas/plantilla.js';
import * as respaldo from './vistas/respaldo.js';
import { pedirAlmacenamientoPersistente } from './db.js';

const vista = document.getElementById('vista');
const titulo = document.getElementById('titulo-pantalla');
const navBotones = Array.from(document.querySelectorAll('.nav-inferior__item'));

const RUTAS = [
  { patron: /^#\/$/, modulo: lista, titulo: 'Productos', ruta: '#/' },
  { patron: /^#\/producto\/(.+)$/, modulo: detalle, titulo: 'Producto', ruta: null },
  { patron: /^#\/ajustes$/, modulo: ajustes, titulo: 'Ajustes', ruta: '#/ajustes' },
  // "Plantilla" ya no está en la navegación principal: solo se llega desde Ajustes cuando el
  // estilo elegido es "Mi plantilla" (CREAR-BRIEF.md, cambio 2026-09-27).
  { patron: /^#\/plantilla$/, modulo: plantilla, titulo: 'Plantilla', ruta: null },
  { patron: /^#\/respaldo$/, modulo: respaldo, titulo: 'Respaldo', ruta: '#/respaldo' },
];

function navegar(hash) {
  if (location.hash === hash) {
    enrutar();
  } else {
    location.hash = hash;
  }
}

async function enrutar() {
  const hash = location.hash || '#/';
  const encontrada = RUTAS.find((r) => r.patron.test(hash)) || RUTAS[0];
  const match = hash.match(encontrada.patron);
  const params = { id: match?.[1] };

  titulo.textContent = encontrada.titulo;
  navBotones.forEach((b) => b.classList.toggle('activo', b.dataset.ruta === encontrada.ruta));

  try {
    await encontrada.modulo.render(vista, { navegar, params });
  } catch (error) {
    vista.textContent = '';
    const alerta = document.createElement('div');
    alerta.setAttribute('role', 'alert');
    alerta.textContent = 'Ocurrió un error al mostrar esta pantalla: ' + error.message;
    vista.append(alerta);
  }
  document.body.classList.remove('cargando');
  document.body.classList.add('listo');
}

window.addEventListener('hashchange', enrutar);
navBotones.forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.ruta) navegar(b.dataset.ruta);
  });
});

window.addEventListener('error', () => {
  document.body.classList.add('error');
});
window.addEventListener('unhandledrejection', () => {
  document.body.classList.add('error');
});

const avisoOffline = document.getElementById('aviso-offline');
function actualizarOffline() {
  avisoOffline.classList.toggle('aviso-offline--oculto', navigator.onLine);
}
window.addEventListener('online', actualizarOffline);
window.addEventListener('offline', actualizarOffline);
actualizarOffline();

enrutar();
pedirAlmacenamientoPersistente();

// El shell del APK (PantallaPrincipal.kt) pregunta esto antes de decidir si el botón Atrás
// nativo sale de la app. `true` = "ya hice algo (cerrar la hoja de revisión / volver a la
// lista)"; `false` = "no hay nada que cerrar, salí de la app". La hoja de revisión (revision.js)
// ya empuja su propio `history.pushState` y se cierra sola con `popstate`; acá solo hace falta
// dispararlo, y para el resto de las pantallas, volver a la lista antes de salir.
window.estadosRapidosBack = function estadosRapidosBack() {
  if (history.state && history.state.hojaRevision) {
    history.back();
    return true;
  }
  if (location.hash && location.hash !== '#/') {
    location.hash = '#/';
    return true;
  }
  return false;
};

// --- Service worker: registro + aviso de versión nueva ---
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('./sw.js', { type: 'module' }).then((registro) => {
    registro.addEventListener('updatefound', () => {
      const nuevo = registro.installing;
      if (!nuevo) return;
      nuevo.addEventListener('statechange', () => {
        if (nuevo.state === 'installed' && navigator.serviceWorker.controller) {
          mostrarAvisoVersion(registro);
        }
      });
    });
  }).catch(() => {
    /* sin service worker (ej. tests): la app sigue funcionando igual */
  });
}

function mostrarAvisoVersion(registro) {
  const aviso = document.getElementById('aviso-version');
  aviso.classList.remove('aviso-version--oculto');
  aviso.querySelector('[data-accion="recargar-version"]').addEventListener(
    'click',
    () => {
      registro.waiting?.postMessage('saltar-espera');
      location.reload();
    },
    { once: true }
  );
}
