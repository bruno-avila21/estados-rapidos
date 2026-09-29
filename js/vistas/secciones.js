// Pantalla "Secciones": gestión de las etiquetas que agrupan/filtran Productos (días para publicar,
// rubros, lo que sea — CREAR-BRIEF.md, ronda "secciones"). Crear, renombrar, reordenar (subir/bajar,
// sin drag obligatorio) y borrar (nunca borra productos, solo los desasigna, con su propia
// confirmación).
// Reskin "Organic Minimalist" (Interfaz/stitch_.../gesti_n_de_secciones_natural): 3 tarjetas ("Tus
// secciones", "Nueva sección", "Plantillas sugeridas") + el consejo de uso, en vez de la pila plana
// anterior. El mock reordena con drag-and-drop y muestra una "prioridad" por sección — la app no
// tiene ninguna de las 2 cosas, así que se mantienen subir/bajar (real) y se saca la prioridad
// (inventada, ver el commit de esta ronda para el detalle).
import * as repo from '../repositorio.js';
import { validarNombreSeccion, contarProductosPorSeccion } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { crearIcono } from '../utils/iconos.js';

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
  const [secciones, productos] = await Promise.all([repo.listarSecciones(), repo.listarProductos()]);
  const conteos = contarProductosPorSeccion(productos, secciones);
  const recargar = () => render(contenedor, { navegar });

  const raiz = document.createElement('div');
  raiz.className = 'pila';

  const filaSuperior = document.createElement('div');
  filaSuperior.className = 'fila secciones__cabecera';
  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'boton boton--fantasma';
  btnVolver.setAttribute('data-accion', 'volver');
  btnVolver.append(crearIcono('volver'), document.createTextNode('Volver a Productos'));
  btnVolver.addEventListener('click', () => navegar('#/'));
  const kicker = document.createElement('span');
  kicker.className = 'secciones__kicker';
  kicker.textContent = 'GESTIÓN DE CATÁLOGO';
  filaSuperior.append(btnVolver, kicker);
  raiz.append(filaSuperior);

  // --- Panel "Tus secciones" ---
  const panelLista = document.createElement('section');
  panelLista.className = 'panel';
  const cabeceraLista = document.createElement('div');
  cabeceraLista.className = 'panel__cabecera';
  const rotuloLista = document.createElement('span');
  rotuloLista.className = 'panel__rotulo';
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
      ? 'Subí o bajá el orden con las flechas, o tocá el nombre para renombrarla.'
      : 'Usalas para agrupar productos por día para publicar ("Lunes", "Martes") o por rubro ("Lencería", "Electrodomésticos") — un producto puede estar en varias a la vez.';

  panelLista.append(cabeceraLista, explicacionLista);

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
  if (secciones.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'texto-tenue';
    vacio.textContent = 'Todavía no creaste ninguna. Empezá con el formulario de abajo o con una plantilla sugerida.';
    lista.append(vacio);
  } else {
    secciones.forEach((seccion, indice) => {
      const cantidad = conteos.porSeccion.get(seccion.id) || 0;
      lista.append(filaSeccion(seccion, indice, secciones.length, cantidad, recargar));
    });
  }
  panelLista.append(lista);
  raiz.append(panelLista);

  // --- Panel "Nueva sección" ---
  const panelNueva = document.createElement('section');
  panelNueva.className = 'panel';
  const rotuloNueva = document.createElement('span');
  rotuloNueva.className = 'panel__rotulo';
  rotuloNueva.append(crearIcono('agregar'), document.createTextNode('Nueva sección'));
  const explicacionNueva = document.createElement('p');
  explicacionNueva.className = 'panel__subtitulo';
  explicacionNueva.textContent = 'Organizá tus productos para seleccionarlos rápido por día o rubro al publicar.';

  const formNueva = document.createElement('form');
  formNueva.className = 'fila';
  const inputNueva = document.createElement('input');
  inputNueva.type = 'text';
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
  const rotuloPresets = document.createElement('span');
  rotuloPresets.className = 'panel__rotulo';
  rotuloPresets.append(crearIcono('chispa'), document.createTextNode('Plantillas sugeridas'));
  const explicacionPresets = document.createElement('p');
  explicacionPresets.className = 'panel__subtitulo';
  explicacionPresets.textContent = 'Un toque para crear estructuras frecuentes de tiendas de venta directa:';
  panelPresets.append(rotuloPresets, explicacionPresets);

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

function filaSeccion(seccion, indice, total, cantidad, recargar) {
  const fila = document.createElement('div');
  fila.className = 'fila fila-seccion panel-secciones__fila';
  fila.setAttribute('data-id', seccion.id);

  const botonesOrden = document.createElement('div');
  botonesOrden.className = 'panel-secciones__acciones';
  const btnSubir = document.createElement('button');
  btnSubir.type = 'button';
  btnSubir.className = 'boton-icono-mini';
  btnSubir.setAttribute('data-accion', 'subir-seccion');
  btnSubir.setAttribute('aria-label', `Subir ${seccion.nombre}`);
  btnSubir.append(crearIcono('flecha-arriba'));
  btnSubir.disabled = indice === 0;
  btnSubir.addEventListener('click', async () => {
    await repo.reordenarSeccion(seccion.id, 'subir');
    recargar();
  });
  const btnBajar = document.createElement('button');
  btnBajar.type = 'button';
  btnBajar.className = 'boton-icono-mini';
  btnBajar.setAttribute('data-accion', 'bajar-seccion');
  btnBajar.setAttribute('aria-label', `Bajar ${seccion.nombre}`);
  btnBajar.append(crearIcono('flecha-abajo'));
  btnBajar.disabled = indice === total - 1;
  btnBajar.addEventListener('click', async () => {
    await repo.reordenarSeccion(seccion.id, 'bajar');
    recargar();
  });
  botonesOrden.append(btnSubir, btnBajar);

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
  conteo.append(crearIcono('etiqueta'), document.createTextNode(`${cantidad} producto${cantidad === 1 ? '' : 's'}`));
  info.append(nombre, conteo);

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

  fila.append(botonesOrden, info, btnBorrar);
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
