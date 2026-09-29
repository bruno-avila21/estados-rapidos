// Pantalla "Secciones": gestión de las etiquetas que agrupan/filtran Productos (días para publicar,
// rubros, lo que sea — CREAR-BRIEF.md, ronda "secciones"). Crear, renombrar, reordenar y borrar
// (nunca borra productos, solo los desasigna, con su propia confirmación).
// Reskin "Organic Minimalist" (Interfaz/stitch_.../gesti_n_de_secciones_natural): 3 tarjetas ("Tus
// secciones", "Nueva sección", "Plantillas sugeridas") + el consejo de uso, en vez de la pila plana
// anterior. El mock muestra una "prioridad" por sección — la app no tiene ese concepto, así que se
// saca (inventada, ver el commit de la ronda "Fase 5" para el detalle).
// Reordenar arrastrando (ronda "reordenar arrastrando", 2026-09-29): la manija de 6 puntos del mock
// (antes: botones subir/bajar) con arrastre real por pointer events — reusa js/reordenar.js
// (moverElemento/indiceDesdePosicion), MISMO patrón que la manija de la hoja de revisión
// (revision.js `habilitarArrastre`): centros medidos una sola vez al empezar, reordena moviendo
// nodos del DOM (nunca los reclona) para no perder el foco, y persiste con `repo.reordenarSecciones`
// solo al soltar/al terminar el paso de teclado (no en cada pointermove, para no golpear la base).
// El teclado (flechas arriba/abajo con foco en la manija) es la alternativa 100% accesible que el
// mock no dibuja (confía solo en drag-and-drop) — con `progresoOrden` (aria-live) anunciando la
// nueva posición.
import * as repo from '../repositorio.js';
import { validarNombreSeccion, contarProductosPorSeccion } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { crearIcono } from '../utils/iconos.js';
import { moverElemento, indiceDesdePosicion } from '../reordenar.js';

// Plantillas sugeridas (mock "PLANTILLAS SUGERIDAS"): un toque crea la sección de una, con el
// nombre sugerido — a diferencia del mock, esto es 100% funcional (no un catálogo decorativo).
const PLANTILLAS_SUGERIDAS = [
  { nombre: 'Publicaciones de lunes', descripcion: 'Inicio de semana comercial', icono: 'calendario' },
  { nombre: 'Liquidación de temporada', descripcion: 'Promociones y saldos', icono: 'porcentaje' },
  { nombre: 'Destacados del mes', descripcion: 'Lo más vendido y recomendado', icono: 'fuego' },
];

export async function render(contenedor, { navegar }) {
  contenedor.textContent = '';
  // Las dos lecturas en paralelo (CREAR-BRIEF.md, mismo criterio que lista.js): el conteo por
  // sección (Fase 2, "S" #2) necesita los productos además de las secciones.
  // `let`, no `const`: el arrastre/teclado (ronda "reordenar arrastrando") reasignan esta variable
  // a una copia con el nuevo orden (`moverElemento`, nunca muta el array en el lugar) — mismo
  // criterio que `productos` en revision.js.
  let [secciones, productos] = await Promise.all([repo.listarSecciones(), repo.listarProductos()]);
  const conteos = contarProductosPorSeccion(productos, secciones);
  const recargar = () => render(contenedor, { navegar });

  const raiz = document.createElement('div');
  raiz.className = 'pila';

  const filaSuperior = document.createElement('div');
  filaSuperior.className = 'fila secciones__cabecera';
  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'pastilla-volver';
  btnVolver.setAttribute('data-accion', 'volver');
  const etiquetaVolver = document.createElement('span');
  etiquetaVolver.textContent = 'Volver a Productos';
  btnVolver.append(crearIcono('volver'), etiquetaVolver);
  btnVolver.addEventListener('click', () => navegar('#/'));
  const kicker = document.createElement('span');
  kicker.className = 'secciones__kicker';
  kicker.textContent = 'GESTIÓN DE CATÁLOGO';
  filaSuperior.append(btnVolver, kicker);
  raiz.append(filaSuperior);

  // --- H1 real de la pantalla (vive en el contenido: patrones.md regla 3 — el header compartido
  // ya no es <h1>, ahora muestra la marca "Estados Rápidos", igual que en Productos). ---
  const cabeceraPagina = document.createElement('div');
  cabeceraPagina.className = 'pagina__cabecera';
  const h1Pagina = document.createElement('h1');
  h1Pagina.className = 'pagina__titulo';
  h1Pagina.textContent = 'Secciones';
  const subtituloPagina = document.createElement('p');
  subtituloPagina.className = 'pagina__subtitulo';
  subtituloPagina.textContent = 'Agrupá tus productos por día o rubro';
  const textosPagina = document.createElement('div');
  textosPagina.append(h1Pagina, subtituloPagina);
  cabeceraPagina.append(textosPagina);
  raiz.append(cabeceraPagina);

  // --- Panel "Tus secciones" ---
  const panelLista = document.createElement('section');
  panelLista.className = 'panel';
  const cabeceraLista = document.createElement('div');
  cabeceraLista.className = 'panel__cabecera';
  const rotuloLista = document.createElement('span');
  rotuloLista.className = 'panel__rotulo panel__rotulo--seccion';
  rotuloLista.style.marginBottom = '0';
  rotuloLista.append(crearIcono('carpeta'), document.createTextNode('Tus secciones'));
  const badgeActivas = document.createElement('span');
  badgeActivas.className = 'panel__badge';
  badgeActivas.textContent = `${secciones.length} activa${secciones.length === 1 ? '' : 's'}`;
  cabeceraLista.append(rotuloLista, badgeActivas);

  const explicacionLista = document.createElement('p');
  explicacionLista.className = 'panel__subtitulo';
  explicacionLista.textContent =
    secciones.length > 0
      ? 'Arrastrá la manija para reordenar, tocá el nombre para renombrarla, o asignala a un producto desde su ficha.'
      : 'Usalas para agrupar productos por día para publicar ("Lunes", "Martes") o por rubro ("Lencería", "Electrodomésticos") — un producto puede estar en varias a la vez.';

  // Anuncia la nueva posición tras un arrastre/paso de teclado (aria-live) — visualmente oculto,
  // mismo truco que `.campo-oculto` (1x1px, sigue en el árbol de accesibilidad).
  const progresoOrden = document.createElement('p');
  progresoOrden.className = 'campo-oculto panel-secciones__progreso-orden';
  progresoOrden.setAttribute('role', 'status');
  progresoOrden.setAttribute('aria-live', 'polite');

  panelLista.append(cabeceraLista, explicacionLista, progresoOrden);

  // Resumen "Sin sección" (Fase 2, "S" #2): mismo dato que el chip de la lista de Productos, para
  // saber de un vistazo si conviene asignar los que quedaron sueltos — solo si hay productos y al
  // menos uno sin ninguna sección (si hay 0 productos cargados, decirlo es ruido).
  if (secciones.length > 0 && conteos.sinSeccion > 0) {
    const resumenSinSeccion = document.createElement('p');
    resumenSinSeccion.className = 'texto-tenue';
    resumenSinSeccion.style.margin = '-6px 0 10px';
    resumenSinSeccion.textContent = `${conteos.sinSeccion} producto${conteos.sinSeccion === 1 ? '' : 's'} sin ninguna sección todavía.`;
    panelLista.append(resumenSinSeccion);
  }

  const lista = document.createElement('div');
  lista.className = 'lista-secciones';

  /** Reordena SOLO el DOM (mueve los nodos existentes, nunca los reclona — no pierde foco ni
   * miniaturas) para que coincida con el orden actual de `secciones`, y refresca el aria-label de
   * cada manija con la posición nueva. Mismo patrón que `sincronizarDomConProductos` en
   * revision.js. */
  function sincronizarFilasConSecciones() {
    const total = secciones.length;
    for (const seccion of secciones) {
      const fila = lista.querySelector(`[data-id="${seccion.id}"]`);
      if (fila) lista.append(fila);
    }
    secciones.forEach((seccion, i) => {
      const manija = lista.querySelector(`[data-id="${seccion.id}"] [data-accion="arrastrar-seccion"]`);
      if (manija) {
        manija.setAttribute(
          'aria-label',
          `Reordenar ${seccion.nombre}, posición ${i + 1} de ${total}. Arrastrar, o usar las flechas arriba y abajo.`
        );
      }
    });
  }

  /** Mueve `desde` a `hasta` en memoria + DOM, sin persistir (el llamador decide cuándo guardar:
   * en cada pointermove sería demasiado tráfico a IndexedDB). */
  function moverSeccionEnPantalla(desde, hasta) {
    secciones = moverElemento(secciones, desde, hasta);
    sincronizarFilasConSecciones();
  }

  async function persistirOrdenSecciones() {
    await repo.reordenarSecciones(secciones.map((s) => s.id));
  }

  /** Alternativa accesible al arrastre (flechas arriba/abajo con foco en la manija, sin drag
   * obligatorio — mismo criterio que antes con subir/bajar): mueve `id` un lugar y persiste. */
  async function moverPorTeclado(id, delta) {
    const desde = secciones.findIndex((s) => s.id === id);
    if (desde === -1) return;
    const hasta = desde + delta;
    if (hasta < 0 || hasta >= secciones.length) return;
    moverSeccionEnPantalla(desde, hasta);
    await persistirOrdenSecciones();
    lista.querySelector(`[data-id="${id}"] [data-accion="arrastrar-seccion"]`)?.focus();
    progresoOrden.textContent = `${secciones[hasta].nombre} — posición ${hasta + 1} de ${secciones.length}.`;
  }

  /** Arrastre con el dedo (pointer events, SOLO desde la manija — la API HTML5 drag/drop no
   * dispara en Android WebView) — mismo patrón que `habilitarArrastre` en revision.js, pero
   * vertical (clientY) y persistiendo en IndexedDB solo al soltar. */
  function habilitarArrastreSeccion(fila, manija, id) {
    let activo = false;
    let indiceActual = -1;
    let centros = [];

    const empezar = (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      activo = true;
      indiceActual = secciones.findIndex((s) => s.id === id);
      centros = Array.from(lista.children).map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      fila.classList.add('panel-secciones__fila--arrastrando');
      try {
        manija.setPointerCapture(ev.pointerId);
      } catch {
        /* entorno de test sin soporte real de Pointer Capture: el arrastre sigue funcionando */
      }
    };
    const mover = (ev) => {
      if (!activo) return;
      ev.preventDefault();
      const destino = indiceDesdePosicion(centros, ev.clientY);
      if (destino !== indiceActual && destino >= 0 && destino < secciones.length) {
        moverSeccionEnPantalla(indiceActual, destino);
        indiceActual = destino;
      }
    };
    const terminar = async () => {
      if (!activo) return;
      activo = false;
      fila.classList.remove('panel-secciones__fila--arrastrando');
      if (indiceActual >= 0 && secciones[indiceActual]) {
        await persistirOrdenSecciones();
        progresoOrden.textContent = `${secciones[indiceActual].nombre} — posición ${indiceActual + 1} de ${secciones.length}.`;
      }
    };
    manija.addEventListener('pointerdown', empezar);
    manija.addEventListener('pointermove', mover);
    manija.addEventListener('pointerup', terminar);
    manija.addEventListener('pointercancel', terminar);
  }

  if (secciones.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'texto-tenue';
    vacio.textContent = 'Todavía no creaste ninguna. Empezá con el formulario de abajo o con una plantilla sugerida.';
    lista.append(vacio);
  } else {
    secciones.forEach((seccion) => {
      const cantidad = conteos.porSeccion.get(seccion.id) || 0;
      lista.append(filaSeccion(seccion, cantidad, recargar, { moverPorTeclado, habilitarArrastreSeccion }));
    });
    sincronizarFilasConSecciones(); // aria-label inicial de cada manija con su posición real
  }
  panelLista.append(lista);
  raiz.append(panelLista);

  // --- Panel "Nueva sección" ---
  const panelNueva = document.createElement('section');
  panelNueva.className = 'panel';
  const rotuloNueva = document.createElement('span');
  rotuloNueva.className = 'panel__rotulo panel__rotulo--seccion';
  rotuloNueva.append(crearIcono('agregar-circulo'), document.createTextNode('Nueva sección'));
  const explicacionNueva = document.createElement('p');
  explicacionNueva.className = 'panel__subtitulo';
  explicacionNueva.textContent = 'Organizá tus productos para seleccionarlos rápido por día o rubro al publicar.';

  const formNueva = document.createElement('form');
  formNueva.className = 'fila';
  const inputNueva = document.createElement('input');
  inputNueva.type = 'text';
  inputNueva.className = 'entrada-texto';
  inputNueva.maxLength = 40;
  inputNueva.placeholder = 'Ej: Lunes, Lencería…';
  inputNueva.setAttribute('aria-label', 'Nombre de la nueva sección');
  const btnAgregar = document.createElement('button');
  btnAgregar.type = 'submit';
  btnAgregar.className = 'boton boton--primario';
  btnAgregar.setAttribute('data-accion', 'crear-seccion');
  btnAgregar.append(crearIcono('agregar'), document.createTextNode('Agregar'));
  formNueva.append(inputNueva, btnAgregar);
  formNueva.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { ok, error } = validarNombreSeccion(inputNueva.value);
    if (!ok) {
      mostrarToast(error);
      return;
    }
    await repo.crearSeccion(inputNueva.value);
    mostrarToast('Sección creada');
    recargar();
  });

  const notaMultiple = document.createElement('p');
  notaMultiple.className = 'texto-tenue secciones__nota-multiple';
  notaMultiple.append(crearIcono('info'), document.createTextNode('Un producto puede pertenecer a varias secciones a la vez.'));

  panelNueva.append(rotuloNueva, explicacionNueva, formNueva, notaMultiple);
  raiz.append(panelNueva);

  // --- Panel "Plantillas sugeridas": un toque, 100% funcional ---
  const panelPresets = document.createElement('section');
  panelPresets.className = 'panel';
  const cabeceraPresets = document.createElement('div');
  cabeceraPresets.className = 'panel__cabecera';
  const rotuloPresets = document.createElement('span');
  rotuloPresets.className = 'panel__rotulo panel__rotulo--seccion';
  rotuloPresets.style.marginBottom = '0';
  rotuloPresets.append(crearIcono('chispa'), document.createTextNode('Plantillas sugeridas'));
  const unToque = document.createElement('span');
  unToque.className = 'panel-secciones__untoque';
  unToque.textContent = 'Un toque';
  cabeceraPresets.append(rotuloPresets, unToque);
  const explicacionPresets = document.createElement('p');
  explicacionPresets.className = 'panel__subtitulo';
  explicacionPresets.textContent = 'Un toque para crear estructuras frecuentes de tiendas de venta directa:';
  panelPresets.append(cabeceraPresets, explicacionPresets);

  const nombresExistentes = new Set(secciones.map((s) => s.nombre.trim().toLowerCase()));
  for (const preset of PLANTILLAS_SUGERIDAS) {
    panelPresets.append(filaPreset(preset, nombresExistentes.has(preset.nombre.toLowerCase()), recargar));
  }
  raiz.append(panelPresets);

  // --- Consejo de uso (mismo patrón que "Consejo de publicación" en Productos) ---
  const consejo = document.createElement('div');
  consejo.className = 'consejo';
  consejo.append(crearIcono('info'));
  const textoConsejo = document.createElement('p');
  const fuerte = document.createElement('strong');
  fuerte.textContent = 'Publicar por sección: ';
  textoConsejo.append(fuerte, document.createTextNode('filtrá Productos por esta sección y usá "Publicar esta sección" para subir todas sus fotos juntas de una vez.'));
  consejo.append(textoConsejo);
  raiz.append(consejo);

  contenedor.append(raiz);
}

function filaSeccion(seccion, cantidad, recargar, { moverPorTeclado, habilitarArrastreSeccion }) {
  const fila = document.createElement('div');
  fila.className = 'fila fila-seccion panel-secciones__fila';
  fila.setAttribute('data-id', seccion.id);

  // Manija de arrastre (6 puntos, a la izquierda de la fila — mock "gesti_n_de_secciones_natural"):
  // reemplaza los botones subir/bajar de antes. Arrastre real con el dedo (pointer events,
  // `habilitarArrastreSeccion`, inyectado desde render()) + flechas arriba/abajo por teclado con el
  // foco puesto acá (alternativa accesible que el mock no dibuja). El aria-label con la posición
  // real lo completa `sincronizarFilasConSecciones` apenas se monta.
  const manija = document.createElement('button');
  manija.type = 'button';
  manija.className = 'fila-seccion__manija';
  manija.setAttribute('data-accion', 'arrastrar-seccion');
  manija.setAttribute('aria-label', `Reordenar ${seccion.nombre}`);
  manija.append(crearIcono('arrastrar'));
  manija.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowUp' && ev.key !== 'ArrowDown') return;
    ev.preventDefault();
    moverPorTeclado(seccion.id, ev.key === 'ArrowUp' ? -1 : 1);
  });
  habilitarArrastreSeccion(fila, manija, seccion.id);

  const info = document.createElement('div');
  info.className = 'panel-secciones__info';
  const nombre = document.createElement('input');
  nombre.type = 'text';
  nombre.className = 'panel-secciones__nombre';
  nombre.maxLength = 40;
  nombre.value = seccion.nombre;
  nombre.setAttribute('data-accion', 'renombrar');
  nombre.setAttribute('aria-label', `Nombre de la sección ${seccion.nombre}`);
  const guardarNombre = async () => {
    const { ok, error } = validarNombreSeccion(nombre.value);
    if (!ok) {
      mostrarToast(error);
      nombre.value = seccion.nombre;
      return;
    }
    if (nombre.value.trim() === seccion.nombre) return;
    await repo.renombrarSeccion(seccion.id, nombre.value);
    mostrarToast('Sección renombrada');
    recargar();
  };
  nombre.addEventListener('blur', guardarNombre);
  nombre.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') nombre.blur();
  });

  // Contador de productos (Fase 2, "S" #2): mismo texto singular/plural que el resumen de "Datos"
  // en Ajustes ("1 producto"/"N productos") — reemplaza la "prioridad" inventada del mock.
  const conteo = document.createElement('span');
  conteo.className = 'panel-secciones__conteo fila-seccion__conteo';
  conteo.append(crearIcono('tag'), document.createTextNode(`${cantidad} producto${cantidad === 1 ? '' : 's'}`));
  info.append(nombre, conteo);

  // Lápiz: no es una acción nueva — enfoca el mismo input de nombre, que ya se renombra al
  // editarlo y perder el foco (`guardarNombre` arriba). El mock lo dibuja como botón aparte.
  const btnRenombrar = document.createElement('button');
  btnRenombrar.type = 'button';
  btnRenombrar.className = 'boton-icono-mini';
  btnRenombrar.setAttribute('aria-label', `Renombrar ${seccion.nombre}`);
  btnRenombrar.append(crearIcono('lapiz'));
  btnRenombrar.addEventListener('click', () => {
    nombre.focus();
    nombre.select();
  });

  const btnBorrar = document.createElement('button');
  btnBorrar.type = 'button';
  btnBorrar.className = 'boton-icono-mini boton-icono-mini--peligro';
  btnBorrar.setAttribute('data-accion', 'borrar-seccion');
  btnBorrar.setAttribute('aria-label', `Borrar ${seccion.nombre}`);
  btnBorrar.append(crearIcono('borrar'));
  btnBorrar.addEventListener('click', async () => {
    const ok = await pedirConfirmacion({
      titulo: 'Borrar sección',
      mensaje: `Se va a borrar "${seccion.nombre}". Los productos NO se borran: solo quedan desasignados de esta sección.`,
      textoConfirmar: 'Borrar',
    });
    if (!ok) return;
    await repo.borrarSeccion(seccion.id);
    mostrarToast('Sección borrada');
    recargar();
  });

  const accionesDerecha = document.createElement('div');
  accionesDerecha.className = 'panel-secciones__acciones-derecha';
  accionesDerecha.append(btnRenombrar, btnBorrar);

  fila.append(manija, info, accionesDerecha);
  return fila;
}

function filaPreset({ nombre, descripcion, icono }, yaExiste, recargar) {
  const fila = document.createElement('div');
  fila.className = 'panel-secciones__preset';
  const infoPreset = document.createElement('div');
  infoPreset.className = 'panel-secciones__preset-info';
  const iconoWrap = document.createElement('span');
  iconoWrap.className = 'panel-secciones__preset-icono';
  iconoWrap.append(crearIcono(icono));
  const textos = document.createElement('div');
  textos.className = 'panel-secciones__preset-textos';
  const titulo = document.createElement('p');
  titulo.className = 'panel-secciones__preset-titulo';
  titulo.textContent = nombre;
  const subtitulo = document.createElement('p');
  subtitulo.className = 'panel-secciones__preset-subtitulo';
  subtitulo.textContent = descripcion;
  textos.append(titulo, subtitulo);
  infoPreset.append(iconoWrap, textos);

  const btnAgregar = document.createElement('button');
  btnAgregar.type = 'button';
  btnAgregar.className = 'boton-icono-mini boton-icono-mini--primario';
  btnAgregar.title = yaExiste ? 'Ya existe una sección con este nombre' : `Crear "${nombre}"`;
  btnAgregar.setAttribute('aria-label', btnAgregar.title);
  btnAgregar.disabled = yaExiste;
  btnAgregar.append(crearIcono(yaExiste ? 'check' : 'agregar'));
  btnAgregar.addEventListener('click', async () => {
    await repo.crearSeccion(nombre);
    mostrarToast('Sección creada');
    recargar();
  });

  fila.append(infoPreset, btnAgregar);
  return fila;
}
