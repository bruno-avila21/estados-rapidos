// Bootstrap de la app: router por hash + registro del service worker + aviso de versión nueva.
// `instalacion.js` se importa primero (aunque no se use acá) para escuchar `beforeinstallprompt`
// desde el arranque: el navegador lo dispara una sola vez por carga y si no hay nadie escuchando
// en ese momento se pierde (Ajustes → "La app" lo necesita más tarde, cuando el usuario navegue ahí).
import './utils/instalacion.js';
import * as lista from './vistas/lista.js';
import * as detalle from './vistas/detalle.js';
import * as secciones from './vistas/secciones.js';
import * as ajustes from './vistas/ajustes.js';
import * as plantilla from './vistas/plantilla.js';
import * as plantillas from './vistas/plantillas.js';
import { aplicarTema } from './utils/tema.js';
import * as respaldo from './vistas/respaldo.js';
import * as repo from './repositorio.js';
import { pedirAlmacenamientoPersistente } from './db.js';
import { crearIcono } from './utils/iconos.js';
import { enApk } from './utils/plataforma.js';
import { tocaCopiarAutomatica } from './respaldo-automatico.js';
import { leerUltimoRespaldo, avisoRespaldoDescartadoHoy, marcarAvisoRespaldoDescartado } from './utils/respaldo-estado.js';
import { generarYGuardarRespaldo } from './utils/respaldo-copia.js';
import { mostrarToast } from './utils/toast.js';
import { pedirConfirmacion } from './utils/confirmar.js';

const vista = document.getElementById('vista');
const encabezado = document.querySelector('.encabezado');
const titulo = document.getElementById('titulo-pantalla');
const subtitulo = document.getElementById('subtitulo-pantalla');
const navBotones = Array.from(document.querySelectorAll('.nav-inferior__item'));

// Íconos de la nav inferior: SVG inline (reskin "Organic Minimalist"), no glifos unicode.
document.querySelectorAll('[data-icono]').forEach((cont) => {
  cont.append(crearIcono(cont.dataset.icono));
});

aplicarTema(); // modo y tono guardados + seguir al sistema si está en automático

const RUTAS = [
  // El h1 dice "Estados Rápidos" (no "Productos"): así lo pinta el TopAppBar de
  // productos_lista_natural/productos_vista_grilla_natural — el resto de las pantallas, fuera del
  // alcance de este rediseño, sigue mostrando el nombre de la pantalla.
  { patron: /^#\/$/, modulo: lista, titulo: 'Estados Rápidos', ruta: '#/', subtitulo: 'Catálogo para estados de WhatsApp' },
  // editar_producto_natural: sin header de app (ni marca ni hamburguesa) — detalle.js dibuja su
  // propia barra "Volver a Productos"/"Descartar" + el H1 en el contenido. `ruta: '#/'` resalta
  // "Productos" en el nav inferior, igual que en el mock.
  {
    patron: /^#\/producto\/(.+)$/,
    modulo: detalle,
    headerOculto: true,
    ruta: '#/',
  },
  // No está en la navegación principal: se llega desde el chip "⚙ Secciones" de Productos.
  // gesti_n_de_secciones_natural: el header muestra la MARCA (como Productos), no "Secciones" — el
  // H1 real + subtítulo los dibuja secciones.js en el contenido. `ruta: '#/'`: el mock resalta
  // "Productos" en el nav inferior (Secciones es parte del mismo pilar de catálogo). La marca va
  // CENTRADA acá (gesti_n_de_secciones_natural, code.html línea 148: sin `justify-between` propio,
  // el div de la marca queda en el medio del header) — distinto de Productos/Respaldo.
  { patron: /^#\/secciones$/, modulo: secciones, titulo: 'Estados Rápidos', ruta: '#/', headerClase: 'encabezado--centrado' },
  // ajustes_de_publicaci_n_natural: header con la MARCA (como Productos/Secciones/Respaldo) +
  // subtítulo "Ajustes de Publicación" (code.html línea 150) — el H1 real "Ajustes" lo dibuja
  // ajustes.js en el contenido (patrones.md regla 3).
  { patron: /^#\/ajustes$/, modulo: ajustes, titulo: 'Estados Rápidos', subtitulo: 'Ajustes de Publicación', ruta: '#/ajustes' },
  // "Plantilla" ya no está en la navegación principal: se llega desde Ajustes (botón "Abrir
  // editor de plantilla" o "Editar" de una tarjeta de estilo). `?estilo=` (ronda "ajustes por
  // estilo", 2026-09-28) dice CUÁL de los 3 estilos con texto edita — se lee de `params.query`.
  // editar_plantilla_natural: sin header de app (mismo criterio que Editar Producto) — plantilla.js
  // dibuja su propia barra "Volver a Ajustes" / "Plantilla" (serif, centrado) / badge de estado.
  { patron: /^#\/plantilla$/, modulo: plantilla, titulo: 'Plantilla', ruta: null, headerOculto: true },
  // Galería de plantillas con favoritas (2026-10-07): se llega desde Ajustes → "Cambiar plantilla"
  // o desde el editor. Misma barra propia que el editor (sin header de app).
  { patron: /^#\/plantillas$/, modulo: plantillas, titulo: 'Plantillas', ruta: null, headerOculto: true },
  // respaldo_natural: mismo criterio que Secciones — header con la MARCA, H1 "Respaldo" en el
  // contenido (respaldo.js). La marca acá va en NEGRITA (code.html línea 135: "font-bold"),
  // a la izquierda (sin centrar) — distinto de Secciones.
  { patron: /^#\/respaldo$/, modulo: respaldo, titulo: 'Estados Rápidos', ruta: '#/respaldo', headerClase: 'encabezado--marca-negrita' },
];

// --- Guardia de salida (pedido 2026-10-03: "te podés ir a Ajustes y perdés los cambios sin aviso").
// Una pantalla con un formulario a medio cargar (hoy: alta/edición de producto) registra con
// `protegerSalida(fn)` una función que dice si hay cambios sin guardar. Si la hay y dice que sí,
// CUALQUIER salida (nav inferior, "Volver", "Cancelar", Atrás del navegador o del APK) pregunta antes
// con el diálogo propio. Todas pasan por `hashchange`, así que alcanza con interceptar ahí.
let guardiaSalida = null; // { hash, hayCambios } | null
let preguntandoSalida = false;

function protegerSalida(hayCambios) {
  guardiaSalida = hayCambios ? { hash: location.hash || '#/', hayCambios } : null;
}

async function alCambiarHash() {
  const destino = location.hash || '#/';
  const guardia = guardiaSalida;
  if (!guardia || destino === guardia.hash) {
    if (!preguntandoSalida) enrutar();
    return;
  }
  if (!preguntandoSalida && !guardia.hayCambios()) {
    enrutar();
    return;
  }
  // Se queda en el formulario (la URL vuelve a ser la suya, sin re-renderizar: no se pierde nada)
  // hasta que la persona decida.
  history.replaceState(history.state, '', guardia.hash);
  if (preguntandoSalida) return;
  preguntandoSalida = true;
  const salir = await pedirConfirmacion({
    titulo: 'Hay cambios sin guardar',
    mensaje: 'Si salís ahora se pierde lo que cargaste en este producto.',
    textoConfirmar: 'Salir sin guardar',
    textoCancelar: 'Seguir editando',
  });
  preguntandoSalida = false;
  if (!salir) return;
  guardiaSalida = null;
  navegar(destino);
}

function navegar(hash) {
  if (location.hash === hash) {
    enrutar();
  } else {
    location.hash = hash;
  }
}

async function enrutar() {
  const hashCompleto = location.hash || '#/';
  const [hash, queryString] = hashCompleto.split('?');
  const encontrada = RUTAS.find((r) => r.patron.test(hash)) || RUTAS[0];
  const match = hash.match(encontrada.patron);
  const params = { id: match?.[1], query: new URLSearchParams(queryString || '') };
  guardiaSalida = null; // la pantalla que se va a dibujar registra la suya si la necesita

  encabezado.hidden = !!encontrada.headerOculto;
  encabezado.className = 'encabezado' + (encontrada.headerClase ? ' ' + encontrada.headerClase : '');
  const textoTitulo = typeof encontrada.titulo === 'function' ? encontrada.titulo(params) : encontrada.titulo;
  titulo.textContent = textoTitulo || '';
  const textoSubtitulo = typeof encontrada.subtitulo === 'function' ? encontrada.subtitulo(params) : encontrada.subtitulo;
  subtitulo.textContent = textoSubtitulo || '';
  subtitulo.hidden = !textoSubtitulo;
  navBotones.forEach((b) => b.classList.toggle('activo', b.dataset.ruta === encontrada.ruta));

  try {
    await encontrada.modulo.render(vista, { navegar, params, protegerSalida });
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

window.addEventListener('hashchange', alCambiarHash);
navBotones.forEach((b) => {
  b.addEventListener('click', () => {
    if (b.dataset.ruta) navegar(b.dataset.ruta);
  });
});

// Header: a la izquierda va la marca (el menú hamburguesa del diseño no tenía destino real y se
// sacó, pedido 2026-10-07). El "+" de la derecha replica el FAB (mismo destino).
document.querySelector('[data-accion="agregar-header"]')?.addEventListener('click', () => navegar('#/producto/nuevo'));

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

// --- Copia automática diaria (ronda "copia automática", Respaldo → "Preferencias de respaldo") ---
// Se revisa al abrir la app Y al volver de segundo plano (`visibilitychange`, no solo `load`: en el
// APK la app casi nunca se "abre" de cero, vuelve de segundo plano) — dispara la copia SILENCIOSA
// en el APK (streaming al puente nativo, sin picker) o, si no hay puente (PWA en el navegador, que
// no puede escribir sin un gesto de la persona), muestra `#aviso-respaldo` con un botón de un toque.
const avisoRespaldo = document.getElementById('aviso-respaldo');

async function revisarCopiaAutomatica() {
  let general;
  try {
    general = await repo.obtenerAjustesGenerales();
  } catch {
    return; // sin IndexedDB disponible (ej. algún entorno de test): no hay nada que revisar
  }
  const ultimo = leerUltimoRespaldo();
  const toca = tocaCopiarAutomatica({ habilitada: general.copiaAutomaticaHabilitada, ultimaCopia: ultimo?.fecha ?? null });
  if (!toca) return;

  if (enApk()) {
    try {
      await generarYGuardarRespaldo('automatico');
      // El puente nativo YA muestra su propio Toast ("Copia automática guardada en
      // Documentos/EstadosRapidos") — no se duplica acá con mostrarToast.
    } catch {
      /* si falla, se reintenta solo la próxima vez que se cumplan las 24h — no se avisa con un
       * error bloqueante por algo que corre en segundo plano sin que la persona lo pidiera */
    }
    return;
  }

  if (avisoRespaldoDescartadoHoy()) return; // ya lo cerró hoy: no insistir hasta que cambie el día
  avisoRespaldo?.classList.remove('aviso-respaldo--oculto');
}

avisoRespaldo?.querySelector('[data-accion="descargar-respaldo-aviso"]')?.addEventListener('click', async () => {
  try {
    await generarYGuardarRespaldo('automatico');
    mostrarToast('Respaldo descargado');
  } catch (error) {
    mostrarToast('No se pudo descargar: ' + error.message);
  } finally {
    avisoRespaldo.classList.add('aviso-respaldo--oculto');
  }
});
avisoRespaldo?.querySelector('[data-accion="descartar-aviso-respaldo"]')?.addEventListener('click', () => {
  marcarAvisoRespaldoDescartado();
  avisoRespaldo.classList.add('aviso-respaldo--oculto');
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') revisarCopiaAutomatica();
});
revisarCopiaAutomatica();

// El shell del APK (PantallaPrincipal.kt) pregunta esto antes de decidir si el botón Atrás
// nativo sale de la app. `true` = "ya hice algo (cerrar la hoja de revisión/un modal / volver a la
// lista)"; `false` = "no hay nada que cerrar, salí de la app". La hoja de revisión (revision.js) y
// los modales propios (ej. "Editar precio" en la grilla, lista.js, Fase 3 "M" #2) ya empujan su
// propio `history.pushState` (`hojaRevision`/`modalAbierto`) y se cierran solos con `popstate`;
// acá solo hace falta dispararlo, y para el resto de las pantallas, volver a la lista antes de salir.
window.estadosRapidosBack = function estadosRapidosBack() {
  if (history.state && (history.state.hojaRevision || history.state.modalAbierto)) {
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
