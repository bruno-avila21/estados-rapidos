// Hoja de revisión: antes de compartir (1 o N productos), arma las imágenes con progreso, deja
// editar la descripción y elegir el estilo, un interruptor para compartir SIN texto, y comparte
// todo junto (o de a uno si el navegador no soporta compartir varios archivos), con descarga como
// último recurso. CREAR-BRIEF.md, cambio de producto 2026-09-27; ronda "publicar más rápido" y
// "compartir sin texto" 2026-09-28.
//
// Reskin "Organic Minimalist" (Interfaz/stitch_.../confirmar_publicaci_n_natural, rediseño-organic
// 2026-09-28): cabecera "Volver a selección" + H1 serif, lista VERTICAL de tarjetas de producto
// (foto chica + nombre/precio, no un carrusel de miniaturas grandes), sección "Texto listo para
// pegar" y "Configuración de salida" (interruptor + destino + calidad) como en el mock. El mock
// además muestra "LOTE #038" (numeración inventada, sin respaldo real) y un selector de "Destino de
// publicación" con botón "Cambiar" (no hay otro destino real: WhatsApp Estados es el único) — los
// dos se dejaron afuera (detalle en el commit de esta ronda). Se suma "Descartar producto" (botón
// "×" de cada tarjeta): el mock lo dibuja y la app no lo tenía — sacar un producto de la tanda antes
// de compartir es una acción real y simple de implementar.
//
// Fase 3 "M" #1 (Interfaz/ANALISIS-STITCH.md): el carrusel se puede reordenar arrastrando con el
// dedo (pointer events sobre la "manija" de cada tarjeta — la API HTML5 drag/drop NO anda en
// Android WebView) o con la alternativa accesible ("Mover antes"/"Mover después", operable por
// teclado igual que cualquier <button> — visible solo al enfocarla con teclado: el mock no la
// dibuja, confía en drag-and-drop nomás). El orden de `productos` es la única fuente de verdad del
// orden de publicación: los archivos finales se guardan en un Map por id de producto
// (`finalesPorId`), nunca por posición de array, así un reordenamiento en el medio de la
// generación en segundo plano no puede desincronizar qué imagen va en qué lugar.
//
// Ronda "publicar más rápido" (con 3-10 productos tardaba bastante en el celu, medido en PERF.md):
//   - El carrusel muestra MINIATURAS livianas (270×480, `componerMiniatura`), no el archivo final:
//     antes se armaba directo el PNG 1080×1920 y se mostraba achicado por CSS, siendo el mismo
//     trabajo pesado que después se re-hacía para compartir.
//   - Los archivos FINALES (1080×1920, JPEG 0.9) se pre-generan en SEGUNDO PLANO apenas se abre la
//     hoja (mientras el usuario todavía está mirando/editando), en paralelo acotado — no al tocar
//     "Compartir": ese botón solo espera a que terminen (si ya terminaron, es inmediato).
//   - Cada foto se decodifica UNA vez (`createImageBitmap`, cacheado por `fotoId`) y se reusa tanto
//     para la miniatura como para el archivo final, y de nuevo si se cambia el estilo de la tanda.
import * as repo from '../repositorio.js';
import { componerSegunEstilo, componerMiniatura } from '../componer.js';
import {
  resolverEstilo,
  resolverDescripcion,
  formatearPrecio,
  ESTILOS_IMAGEN,
  ETIQUETA_ESTILO,
  CALIDADES_IMAGEN,
  CALIDAD_IMAGEN_POR_DEFECTO,
  ETIQUETA_CALIDAD_IMAGEN,
  resolverOpcionesExportacion,
} from '../modelo.js';
import { compartirArchivos, copiarDescripcion, descargarImagen, puedeCompartirArchivos } from '../utils/compartir.js';
import { mostrarToast } from '../utils/toast.js';
import { crearIcono } from '../utils/iconos.js';
import { moverElemento, indiceDesdePosicion } from '../reordenar.js';

/** Igual criterio defensivo que `lista.js` (`sincronizarSeleccion`): un id nunca debería romper el
 * selector, pero si `CSS.escape` no está disponible (entorno de test viejo) no hay que tirar. */
function selectorPorId(id) {
  try {
    return `[data-id="${CSS.escape(id)}"]`;
  } catch {
    return null;
  }
}

export const LIMITE_IMAGENES = 30;
const CONCURRENCIA_EXPORTACION = 3; // "en paralelo ACOTADO": no decodificar/comprimir todo a la vez

// Detalle real de cada calidad (JPEG y su nivel de compresión — modelo.js, OPCIONES_EXPORTACION_POR_
// CALIDAD): nada de un tamaño en KB inventado, WhatsApp igual recomprime la imagen al recibirla.
const DETALLE_CALIDAD = {
  estandar: 'JPEG comprimido (calidad 0.85): más rápida de armar y compartir.',
  alta: 'JPEG casi sin compresión (calidad 0.95): mejor nitidez, pesa más.',
};

/** Corre `tarea` sobre `items` con como mucho `limite` en simultáneo, en orden de `items`. */
async function enParaleloAcotado(items, limite, tarea) {
  const resultados = new Array(items.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < items.length) {
      const i = siguiente;
      siguiente += 1;
      // eslint-disable-next-line no-await-in-loop -- es justamente el trabajador de un pool acotado
      resultados[i] = await tarea(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, trabajador));
  return resultados;
}

export async function abrirHojaRevision({ ids }) {
  if (!ids?.length) return;

  const idsLimitados = ids.slice(0, LIMITE_IMAGENES);
  if (ids.length > LIMITE_IMAGENES) {
    mostrarToast(`Whatsapp acepta hasta ${LIMITE_IMAGENES} por vez: se arman las primeras ${LIMITE_IMAGENES}.`);
  }

  // `let`, no `const`: reordenar (Fase 3 "M" #1) y descartar reasignan esta variable a una copia
  // con el nuevo contenido/orden (`moverElemento`/`filter`, nunca mutan el array en el lugar) — es
  // la única fuente de verdad del orden y la composición de la tanda a publicar.
  let productos = [];
  for (const id of idsLimitados) {
    const producto = await repo.obtenerProducto(id);
    if (producto) productos.push(producto);
  }
  if (!productos.length) return;

  const general = await repo.obtenerAjustesGenerales();
  const plantillaConfig = await repo.obtenerPlantillaConfig();
  let estiloSesion = null; // si se elige acá, se usa para TODAS las imágenes de esta hoja
  // Calidad de exportación (Fase 2, "S" #5): arranca en la última elegida (ajustes generales) y se
  // recuerda apenas se cambia acá, igual que "Incluir texto".
  let calidadImagen = CALIDADES_IMAGEN.includes(general.calidadImagen) ? general.calidadImagen : CALIDAD_IMAGEN_POR_DEFECTO;

  // Decodificar cada foto UNA sola vez y reusarla (miniatura + final + si cambia el estilo).
  const bitmapsFoto = new Map(); // fotoId -> Promise<ImageBitmap|null>
  let bitmapPlantillaPromesa = null;
  let urlsMiniatura = [];
  // Blob final (1080x1920 JPEG) por ID de producto — NUNCA por posición de array (ver nota de
  // arriba sobre reordenar en el medio de la generación en segundo plano).
  let finalesPorId = new Map();
  let promesaFinales = Promise.resolve();
  let generacion = 0; // se incrementa cada vez que se rearma todo (cambia el estilo de la tanda)

  function bitmapDeFoto(producto) {
    if (!producto.fotoId) return Promise.resolve(null);
    if (!bitmapsFoto.has(producto.fotoId)) {
      bitmapsFoto.set(
        producto.fotoId,
        repo.obtenerFotoBlob(producto.fotoId).then((blob) => (blob ? createImageBitmap(blob) : null))
      );
    }
    return bitmapsFoto.get(producto.fotoId);
  }

  function bitmapDePlantilla() {
    if (!bitmapPlantillaPromesa) {
      bitmapPlantillaPromesa = repo.obtenerImagenPlantillaBlob().then((blob) => createImageBitmap(blob));
    }
    return bitmapPlantillaPromesa;
  }

  async function datosParaProducto(producto) {
    const estilo = estiloSesion || resolverEstilo(producto, general);
    const [fotoImagen, plantillaImagen] = await Promise.all([
      bitmapDeFoto(producto),
      estilo === 'mi-plantilla' ? bitmapDePlantilla() : Promise.resolve(null),
    ]);
    const descripcion = resolverDescripcion(producto, { ...general, formatoPrecio: plantillaConfig.formatoPrecio });
    return {
      estilo,
      plantillaImagen,
      fotoImagen,
      producto,
      ajustes: plantillaConfig.ajustesPorEstilo?.[estilo] ?? {},
      formatoPrecio: plantillaConfig.formatoPrecio,
      descripcion,
      encuadreFoto: general.encuadreFoto,
    };
  }

  // --- Overlay y estructura ---
  const overlay = document.createElement('div');
  // El mock (confirmar_publicaci_n_natural) es una PANTALLA completa, no una hoja chica desde
  // abajo: `--completo` estira el overlay a toda la altura para que la hoja tape TODO el viewport,
  // sin dejar ver el header de la app atenuado arriba.
  overlay.className = 'dialogo-overlay dialogo-overlay--completo';
  const caja = document.createElement('div');
  caja.className = 'dialogo hoja-revision';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  caja.setAttribute('aria-label', 'Confirmar publicación');

  // --- Cabecera: "Volver a selección" + H1 + subtítulo con la cantidad real ---
  const cabecera = document.createElement('div');
  cabecera.className = 'hoja-revision__cabecera';
  const btnVolverCabecera = document.createElement('button');
  btnVolverCabecera.type = 'button';
  btnVolverCabecera.className = 'enlace-volver';
  btnVolverCabecera.setAttribute('data-accion', 'revision-volver');
  const etiquetaVolver = document.createElement('span');
  etiquetaVolver.textContent = 'Volver a selección';
  btnVolverCabecera.append(crearIcono('volver'), etiquetaVolver);
  btnVolverCabecera.addEventListener('click', () => cerrar());

  const titulo = document.createElement('h2');
  titulo.className = 'dialogo__titulo';
  const subtitulo = document.createElement('p');
  subtitulo.className = 'hoja-revision__subtitulo';
  cabecera.append(btnVolverCabecera, titulo, subtitulo);

  const progreso = document.createElement('p');
  progreso.className = 'texto-tenue';
  progreso.setAttribute('role', 'status');

  // --- 1) Secuencia de publicación ---
  const seccionSecuencia = document.createElement('div');
  seccionSecuencia.className = 'hoja-revision__seccion';
  const cabeceraSecuencia = document.createElement('div');
  cabeceraSecuencia.className = 'hoja-revision__seccion-cabecera';
  const tituloSecuencia = document.createElement('h3');
  tituloSecuencia.className = 'hoja-revision__seccion-titulo';
  tituloSecuencia.textContent = 'Secuencia de publicación';
  const hintReordenar = document.createElement('span');
  hintReordenar.className = 'hoja-revision__seccion-hint';
  hintReordenar.append(crearIcono('reordenar-vertical'), document.createTextNode('Reordenar'));
  cabeceraSecuencia.append(tituloSecuencia, hintReordenar);

  const carrusel = document.createElement('div');
  carrusel.className = 'hoja-revision__carrusel';

  const notaSecuencia = document.createElement('p');
  notaSecuencia.className = 'hoja-revision__nota';
  notaSecuencia.append(crearIcono('info'), document.createTextNode('Se publicarán en este orden exacto en tus estados de WhatsApp.'));

  seccionSecuencia.append(cabeceraSecuencia, progreso, carrusel, notaSecuencia);

  // --- "Estilo para esta tanda" (no está en el mock — se mantiene, override de todas las imágenes) ---
  const campoEstilo = document.createElement('div');
  campoEstilo.className = 'campo';
  const labelEstilo = document.createElement('label');
  labelEstilo.className = 'campo__etiqueta';
  labelEstilo.htmlFor = 'revision-estilo';
  labelEstilo.textContent = 'Estilo para esta tanda';
  const selectEstilo = document.createElement('select');
  selectEstilo.id = 'revision-estilo';
  selectEstilo.setAttribute('data-accion', 'revision-estilo');
  const opcionAuto = document.createElement('option');
  opcionAuto.value = '';
  opcionAuto.textContent = 'El de cada producto';
  selectEstilo.append(opcionAuto);
  for (const valor of ESTILOS_IMAGEN) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = ETIQUETA_ESTILO[valor];
    selectEstilo.append(opcion);
  }
  campoEstilo.append(labelEstilo, selectEstilo);

  // --- 2) Texto listo para pegar ---
  const seccionTexto = document.createElement('div');
  seccionTexto.className = 'hoja-revision__seccion';
  const cabeceraTexto = document.createElement('div');
  cabeceraTexto.className = 'hoja-revision__seccion-cabecera';
  const tituloTexto = document.createElement('h3');
  tituloTexto.className = 'hoja-revision__seccion-titulo';
  tituloTexto.textContent = 'Texto listo para pegar';
  const pillCopiado = document.createElement('span');
  pillCopiado.className = 'hoja-revision__pill';
  pillCopiado.append(crearIcono('check'), document.createTextNode('Se copia al compartir'));
  cabeceraTexto.append(tituloTexto, pillCopiado);

  const cajaTexto = document.createElement('div');
  cajaTexto.className = 'hoja-revision__texto-caja';
  const contenidoTexto = document.createElement('div');
  contenidoTexto.className = 'hoja-revision__texto-contenido';
  const labelDescripcion = document.createElement('label');
  labelDescripcion.className = 'campo__etiqueta';
  labelDescripcion.htmlFor = 'revision-descripcion';
  labelDescripcion.textContent =
    productos.length === 1 ? 'Descripción' : 'Descripción (una por línea, se comparte como un solo texto)';
  const textareaDescripcion = document.createElement('textarea');
  textareaDescripcion.id = 'revision-descripcion';
  textareaDescripcion.value = productos.map((p) => resolverDescripcion(p, { ...general, formatoPrecio: plantillaConfig.formatoPrecio })).join('\n');

  const pieTexto = document.createElement('div');
  pieTexto.className = 'hoja-revision__texto-pie';
  // --- "Copiar descripción" (Fase 2, "S" #4): copia el texto de ARRIBA al portapapeles en el
  // momento, con toast de confirmación (o de error) y sin depender de "Incluir texto" ni de tocar
  // "Compartir" — útil para pegar el texto a mano en otro lado antes de publicar. ---
  const btnCopiarDescripcion = document.createElement('button');
  btnCopiarDescripcion.type = 'button';
  btnCopiarDescripcion.className = 'boton boton--fantasma';
  btnCopiarDescripcion.setAttribute('data-accion', 'revision-copiar-descripcion');
  btnCopiarDescripcion.append(crearIcono('copiar'), document.createTextNode('Copiar descripción'));
  btnCopiarDescripcion.addEventListener('click', () => {
    const texto = textareaDescripcion.value.trim();
    if (!texto) {
      mostrarToast('No hay descripción para copiar');
      return;
    }
    copiarDescripcion(texto);
  });
  // El mock ofrece "Modificar plantilla para este lote" (una plantilla solo para esta tanda): la
  // app no tiene ese alcance, solo una plantilla general — el link va a Ajustes de verdad.
  const enlaceEditarPlantilla = document.createElement('button');
  enlaceEditarPlantilla.type = 'button';
  enlaceEditarPlantilla.className = 'hoja-revision__editar-plantilla';
  enlaceEditarPlantilla.setAttribute('data-accion', 'revision-editar-plantilla');
  enlaceEditarPlantilla.textContent = 'Editar plantilla en Ajustes';
  enlaceEditarPlantilla.addEventListener('click', () => {
    cerrar();
    location.hash = '#/ajustes';
  });
  pieTexto.append(btnCopiarDescripcion, enlaceEditarPlantilla);

  contenidoTexto.append(labelDescripcion, textareaDescripcion, pieTexto);
  cajaTexto.append(crearIcono('portapapeles'), contenidoTexto);
  seccionTexto.append(cabeceraTexto, cajaTexto);

  // --- 3) Configuración de salida ---
  const seccionConfig = document.createElement('div');
  seccionConfig.className = 'hoja-revision__seccion';
  const tituloConfig = document.createElement('h3');
  tituloConfig.className = 'hoja-revision__seccion-titulo';
  tituloConfig.style.marginBottom = '8px';
  tituloConfig.textContent = 'Configuración de salida';
  const panelConfig = document.createElement('div');
  panelConfig.className = 'hoja-revision__panel-config';

  // --- "Incluir texto" (ronda "compartir sin texto"): apagado, no se copia al portapapeles ni se
  // manda como EXTRA_TEXT/text; se recuerda la última elección en Ajustes generales. Restyle como
  // interruptor (mock: "Copiar texto automáticamente"), mismo <input> real de siempre. ---
  const filaIncluirTexto = document.createElement('div');
  filaIncluirTexto.className = 'hoja-revision__fila-config';
  const labelIncluirTexto = document.createElement('label');
  labelIncluirTexto.className = 'hoja-revision__fila-switch';
  const textosIncluirTexto = document.createElement('div');
  textosIncluirTexto.className = 'hoja-revision__fila-switch-textos';
  const tituloIncluirTexto = document.createElement('span');
  tituloIncluirTexto.className = 'hoja-revision__fila-switch-titulo';
  tituloIncluirTexto.textContent = 'Copiar texto automáticamente';
  const ayudaIncluirTexto = document.createElement('span');
  ayudaIncluirTexto.className = 'hoja-revision__fila-switch-ayuda';
  ayudaIncluirTexto.textContent = 'Copia la descripción al portapapeles para pegarla al compartir.';
  textosIncluirTexto.append(tituloIncluirTexto, ayudaIncluirTexto);
  const interruptorIncluirTexto = document.createElement('span');
  interruptorIncluirTexto.className = 'interruptor';
  const checkIncluirTexto = document.createElement('input');
  checkIncluirTexto.type = 'checkbox';
  checkIncluirTexto.id = 'revision-incluir-texto';
  checkIncluirTexto.setAttribute('data-accion', 'revision-incluir-texto');
  checkIncluirTexto.checked = general.incluirTextoAlCompartir !== false;
  const pistaIncluirTexto = document.createElement('span');
  pistaIncluirTexto.className = 'interruptor__pista';
  interruptorIncluirTexto.append(checkIncluirTexto, pistaIncluirTexto);
  labelIncluirTexto.append(textosIncluirTexto, interruptorIncluirTexto);
  filaIncluirTexto.append(labelIncluirTexto);

  // --- Destino de publicación: informativo (WhatsApp Estados es el ÚNICO destino real — el mock
  // ofrece "Cambiar", que no tiene ningún otro destino detrás, así que no se dibuja el botón). ---
  const filaDestino = document.createElement('div');
  filaDestino.className = 'hoja-revision__fila-config hoja-revision__destino';
  const textosDestino = document.createElement('div');
  textosDestino.className = 'hoja-revision__destino-textos';
  const tituloDestino = document.createElement('span');
  tituloDestino.className = 'hoja-revision__destino-titulo';
  tituloDestino.textContent = 'Destino de publicación';
  const valorDestino = document.createElement('span');
  valorDestino.className = 'hoja-revision__destino-valor';
  valorDestino.textContent = 'Mis Estados de WhatsApp';
  textosDestino.append(tituloDestino, valorDestino);
  filaDestino.append(crearIcono('planeta'), textosDestino);

  // --- Calidad de imagen (Fase 2, "S" #5): "Estándar" (JPEG 0.85, más liviana y rápida de armar/
  // compartir) o "Alta" (JPEG 0.95, mejor nitidez). Nunca PNG: WhatsApp recomprime igual la imagen
  // que reciba (modelo.js, OPCIONES_EXPORTACION_POR_CALIDAD). Se recuerda entre hojas de revisión.
  // Restyle como 2 tarjetas ("mock": grid-cols-2), mismos data-accion/aria-pressed de siempre. ---
  const filaCalidad = document.createElement('div');
  filaCalidad.className = 'hoja-revision__fila-config';
  const tituloCalidad = document.createElement('div');
  tituloCalidad.className = 'hoja-revision__calidad-titulo';
  tituloCalidad.append(crearIcono('camara'), document.createTextNode('Calidad y compresión'));
  const grillaCalidad = document.createElement('div');
  grillaCalidad.className = 'hoja-revision__calidad-grilla';
  const botonesCalidad = {};
  for (const valor of CALIDADES_IMAGEN) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'hoja-revision__calidad-opcion' + (calidadImagen === valor ? ' hoja-revision__calidad-opcion--activa' : '');
    btn.setAttribute('data-accion', `revision-calidad-${valor}`);
    btn.setAttribute('aria-pressed', String(calidadImagen === valor));
    const badge = document.createElement('span');
    badge.className = 'hoja-revision__calidad-badge';
    badge.textContent = valor === CALIDAD_IMAGEN_POR_DEFECTO ? 'Recomendada' : 'HD';
    const nombre = document.createElement('span');
    nombre.className = 'hoja-revision__calidad-nombre';
    nombre.textContent = ETIQUETA_CALIDAD_IMAGEN[valor];
    const detalle = document.createElement('span');
    detalle.className = 'hoja-revision__calidad-detalle';
    detalle.textContent = DETALLE_CALIDAD[valor];
    btn.append(badge, nombre, detalle);
    btn.addEventListener('click', async () => {
      if (calidadImagen === valor) return;
      calidadImagen = valor;
      for (const v of CALIDADES_IMAGEN) {
        botonesCalidad[v].classList.toggle('hoja-revision__calidad-opcion--activa', v === valor);
        botonesCalidad[v].setAttribute('aria-pressed', String(v === valor));
      }
      await repo.guardarCalidadImagen(valor);
      await regenerarFinales();
    });
    botonesCalidad[valor] = btn;
    grillaCalidad.append(btn);
  }
  filaCalidad.append(tituloCalidad, grillaCalidad);

  panelConfig.append(filaIncluirTexto, filaDestino, filaCalidad);
  seccionConfig.append(tituloConfig, panelConfig);

  actualizarEstadoIncluirTexto();
  checkIncluirTexto.addEventListener('change', async () => {
    actualizarEstadoIncluirTexto();
    await repo.guardarIncluirTextoAlCompartir(checkIncluirTexto.checked);
  });
  function actualizarEstadoIncluirTexto() {
    textareaDescripcion.disabled = !checkIncluirTexto.checked;
    pillCopiado.hidden = !checkIncluirTexto.checked;
  }

  // --- 4) Acciones primarias/secundarias ---
  const acciones = document.createElement('div');
  acciones.className = 'dialogo__acciones';
  const btnCompartir = document.createElement('button');
  btnCompartir.type = 'button';
  btnCompartir.className = 'boton boton--primario';
  btnCompartir.setAttribute('data-accion', 'revision-compartir');
  const btnCerrar = document.createElement('button');
  btnCerrar.type = 'button';
  btnCerrar.className = 'boton boton--fantasma hoja-revision__cancelar';
  btnCerrar.setAttribute('data-accion', 'revision-cerrar');
  btnCerrar.textContent = 'Cancelar y volver';
  acciones.append(btnCompartir, btnCerrar);

  /** Título/subtítulo/botón "Compartir" reflejan SIEMPRE la cantidad real de `productos` — se
   * vuelve a llamar cada vez que cambia (descartar un producto de la tanda). */
  function actualizarContadores() {
    // Título fijo, como el H1 del mock ("Confirmar Publicación"): la cantidad real va en el
    // subtítulo de abajo, no en el título (antes decía "Revisar antes de publicar"/"Revisar N
    // productos" — mismo dato, ahora en el mismo lugar que el diseño).
    titulo.textContent = 'Confirmar Publicación';
    subtitulo.textContent = `${productos.length} estado${productos.length === 1 ? '' : 's'} listo${productos.length === 1 ? '' : 's'} para enviar a WhatsApp`;
    btnCompartir.replaceChildren(document.createTextNode(`Abrir WhatsApp y Publicar (${productos.length})`), crearIcono('enviar'));
  }
  actualizarContadores();

  caja.append(cabecera, seccionSecuencia, campoEstilo, seccionTexto, seccionConfig, acciones);

  // El mock dibuja la MISMA nav inferior de siempre debajo de la hoja (es una pantalla, no una
  // hoja chica): al ser esta hoja pantalla completa (`--completo`), la nav real de la app queda
  // tapada detrás — se repite acá con las mismas clases/íconos, "Productos" activo (seguís en el
  // flujo de publicar desde Productos), cerrando la hoja antes de cambiar de pantalla.
  const navInferior = document.createElement('nav');
  navInferior.className = 'nav-inferior';
  navInferior.setAttribute('aria-label', 'Navegación principal');
  const irA = (hash) => {
    cerrar();
    if (hash !== '#/') location.hash = hash;
  };
  const itemNav = (icono, etiqueta, hash, activo) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'nav-inferior__item' + (activo ? ' activo' : '');
    if (activo) btn.setAttribute('aria-current', 'page');
    const spanIcono = document.createElement('span');
    spanIcono.className = 'nav-inferior__icono';
    spanIcono.append(crearIcono(icono));
    btn.append(spanIcono, document.createTextNode(etiqueta));
    btn.addEventListener('click', () => irA(hash));
    return btn;
  };
  navInferior.append(
    itemNav('inventario', 'Productos', '#/', true),
    itemNav('ajustes', 'Ajustes', '#/ajustes', false),
    itemNav('respaldo', 'Respaldo', '#/respaldo', false)
  );

  overlay.append(caja, navInferior);
  document.body.append(overlay);

  const alEscape = (ev) => {
    if (ev.key === 'Escape') cerrar();
  };
  document.addEventListener('keydown', alEscape);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) cerrar();
  });
  btnCerrar.addEventListener('click', () => cerrar());

  // Atrás de Android cierra la hoja en vez de cambiar la pantalla de abajo: antes la hoja quedaba
  // encima de la otra vista, tapándolo todo (BUGS.md #20). Abrirla suma un paso al historial.
  history.pushState({ hojaRevision: true }, '');
  const alVolver = () => cerrar({ desdeHistorial: true });
  window.addEventListener('popstate', alVolver);

  function cerrar({ desdeHistorial = false } = {}) {
    if (!overlay.isConnected) return;
    document.removeEventListener('keydown', alEscape);
    window.removeEventListener('popstate', alVolver);
    urlsMiniatura.forEach((u) => URL.revokeObjectURL(u));
    overlay.remove();
    // Cerrada con la X, Escape o al compartir: sacar el paso que se sumó al abrir.
    if (!desdeHistorial && history.state?.hojaRevision) history.back();
  }

  /** Arma UNA tarjeta de la secuencia: foto chica + nombre/precio + (si hay más de 1 producto)
   * manija de arrastre, badge de posición, "Portada"/"Paso N" y "Descartar producto" — más la
   * alternativa accesible ("Mover antes"/"Mover después", operable por teclado). */
  function crearItemCarrusel(producto) {
    const item = document.createElement('div');
    item.className = 'hoja-revision__item';
    item.setAttribute('data-id', producto.id);
    item.setAttribute('role', 'group');

    const foto = document.createElement('div');
    foto.className = 'hoja-revision__foto';
    const img = document.createElement('img');
    img.className = 'hoja-revision__miniatura';
    img.alt = producto.nombre;
    foto.append(img);

    const info = document.createElement('div');
    info.className = 'hoja-revision__info';
    const paso = document.createElement('span');
    paso.className = 'hoja-revision__paso';
    const nombre = document.createElement('h3');
    nombre.className = 'hoja-revision__nombre';
    nombre.textContent = producto.nombre;
    const precio = document.createElement('p');
    precio.className = 'hoja-revision__precio';
    precio.textContent = producto.precio != null ? formatearPrecio(producto.precio, plantillaConfig.formatoPrecio) : 'Sin precio';
    info.append(paso, nombre, precio);

    const acciones2 = document.createElement('div');
    acciones2.className = 'hoja-revision__acciones-item';

    if (productos.length > 1) {
      const orden = document.createElement('span');
      orden.className = 'hoja-revision__orden';
      orden.setAttribute('aria-hidden', 'true');
      foto.append(orden);

      const manija = document.createElement('button');
      manija.type = 'button';
      manija.className = 'hoja-revision__manija';
      manija.setAttribute('data-accion', 'arrastrar');
      manija.setAttribute('aria-label', `Arrastrar para reordenar ${producto.nombre}`);
      manija.append(crearIcono('arrastrar'));

      const controles = document.createElement('div');
      controles.className = 'hoja-revision__controles';
      const btnAntes = document.createElement('button');
      btnAntes.type = 'button';
      btnAntes.className = 'hoja-revision__mover';
      btnAntes.setAttribute('data-accion', 'mover-antes');
      btnAntes.append(crearIcono('flecha-izquierda'));
      const btnDespues = document.createElement('button');
      btnDespues.type = 'button';
      btnDespues.className = 'hoja-revision__mover';
      btnDespues.setAttribute('data-accion', 'mover-despues');
      btnDespues.append(crearIcono('flecha-derecha'));
      btnAntes.addEventListener('click', () => moverProducto(producto.id, -1));
      btnDespues.addEventListener('click', () => moverProducto(producto.id, 1));
      controles.append(btnAntes, btnDespues);

      habilitarArrastre(item, manija);
      acciones2.append(manija, controles);
    }

    // "Descartar producto" (mock: botón "×"): saca ESTE producto de la tanda antes de compartir.
    // Nunca deja la tanda en 0 (si es el último, avisa y no hace nada — cerrar la hoja es la forma
    // de cancelar del todo).
    const btnDescartar = document.createElement('button');
    btnDescartar.type = 'button';
    btnDescartar.className = 'hoja-revision__descartar';
    btnDescartar.setAttribute('data-accion', 'descartar-producto');
    btnDescartar.setAttribute('aria-label', `Descartar ${producto.nombre} de esta tanda`);
    btnDescartar.append(crearIcono('equis'));
    btnDescartar.addEventListener('click', () => descartarProducto(producto.id));
    acciones2.append(btnDescartar);

    item.append(foto, info, acciones2);
    return { elemento: item, img, paso };
  }

  /** Reordena SOLO el DOM del carrusel para que coincida con el orden actual de `productos`
   * (reusa los nodos ya creados — `append` de un hijo existente lo MUEVE, no lo clona, así que
   * no hay que rearmar miniaturas ni relanzar ninguna composición) y refresca badges/aria/disabled/
   * "Portada"-"Paso N". */
  function sincronizarDomConProductos() {
    for (const producto of productos) {
      const selector = selectorPorId(producto.id);
      const el = selector && carrusel.querySelector(selector);
      if (el) carrusel.append(el);
    }
    const total = productos.length;
    productos.forEach((producto, i) => {
      const selector = selectorPorId(producto.id);
      const el = selector && carrusel.querySelector(selector);
      if (!el) return;
      el.setAttribute('aria-label', `${producto.nombre}, posición ${i + 1} de ${total}`);
      const orden = el.querySelector('.hoja-revision__orden');
      if (orden) orden.textContent = `${i + 1}/${total}`;
      const paso = el.querySelector('.hoja-revision__paso');
      if (paso) {
        paso.classList.toggle('hoja-revision__paso--portada', i === 0);
        paso.textContent = i === 0 ? 'Portada' : `Paso ${i + 1}`;
      }
      const btnAntes = el.querySelector('[data-accion="mover-antes"]');
      const btnDespues = el.querySelector('[data-accion="mover-despues"]');
      if (btnAntes) {
        btnAntes.disabled = i === 0;
        btnAntes.setAttribute('aria-label', `Mover ${producto.nombre} antes (posición ${i + 1} de ${total})`);
      }
      if (btnDespues) {
        btnDespues.disabled = i === total - 1;
        btnDespues.setAttribute('aria-label', `Mover ${producto.nombre} después (posición ${i + 1} de ${total})`);
      }
    });
  }

  /** Alternativa accesible al arrastre (botones + teclado, sin drag obligatorio — mismo criterio
   * que `reordenarSeccion` en secciones.js): mueve el producto `id` `delta` posiciones (-1/+1). */
  function moverProducto(id, delta) {
    const desde = productos.findIndex((p) => p.id === id);
    if (desde === -1) return;
    const hasta = desde + delta;
    if (hasta < 0 || hasta >= productos.length) return;
    productos = moverElemento(productos, desde, hasta);
    sincronizarDomConProductos();
    const accion = delta < 0 ? 'mover-antes' : 'mover-despues';
    const selector = selectorPorId(id);
    const boton = selector && carrusel.querySelector(`${selector} [data-accion="${accion}"]`);
    // El foco se queda en el MISMO botón lógico (mismo producto) para poder seguir moviéndolo con
    // el teclado sin perder contexto — si ese botón ahora está deshabilitado (llegó a la punta),
    // el foco pasa al opuesto del mismo producto.
    const alternativo = selector && carrusel.querySelector(`${selector} [data-accion="${delta < 0 ? 'mover-despues' : 'mover-antes'}"]`);
    (boton && !boton.disabled ? boton : alternativo)?.focus();
    progreso.textContent = `${productos[hasta].nombre} — posición ${hasta + 1} de ${productos.length}.`;
  }

  /** Saca `id` de la tanda: no borra el producto (sigue existiendo en Productos), solo lo excluye
   * de ESTA publicación. Con 1 solo producto no hace nada (avisa: cerrar la hoja es "cancelar
   * todo"). No hace falta regenerar nada — la imagen ya compuesta de los demás sigue sirviendo. */
  function descartarProducto(id) {
    if (productos.length <= 1) {
      mostrarToast('Para no publicar ninguno, cerrá la hoja con "Cancelar y volver".');
      return;
    }
    const producto = productos.find((p) => p.id === id);
    if (!producto) return;
    productos = productos.filter((p) => p.id !== id);
    const selector = selectorPorId(id);
    const el = selector && carrusel.querySelector(selector);
    el?.remove();
    sincronizarDomConProductos();
    actualizarContadores();
    mostrarToast(`${producto.nombre} se sacó de esta tanda`);
  }

  /** Arrastre con el dedo (pointer events, Fase 3 "M" #1) SOLO desde la manija — la API HTML5
   * drag/drop no dispara en Android WebView (CLAUDE.md). Los "slots" X se miden una sola vez al
   * empezar (no cambian de ancho mientras se reordena) y `indiceDesdePosicion` dice a qué slot
   * corresponde soltar según dónde está el dedo ahora. */
  function habilitarArrastre(item, manija) {
    let activo = false;
    let indiceActual = -1;
    let centros = [];

    const empezar = (ev) => {
      if (ev.pointerType === 'mouse' && ev.button !== 0) return;
      activo = true;
      indiceActual = productos.findIndex((p) => p.id === item.dataset.id);
      centros = Array.from(carrusel.children).map((el) => {
        const r = el.getBoundingClientRect();
        return r.top + r.height / 2;
      });
      item.classList.add('hoja-revision__item--arrastrando');
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
      if (destino !== indiceActual && destino >= 0 && destino < productos.length) {
        productos = moverElemento(productos, indiceActual, destino);
        sincronizarDomConProductos();
        indiceActual = destino;
      }
    };
    const terminar = () => {
      if (!activo) return;
      activo = false;
      item.classList.remove('hoja-revision__item--arrastrando');
      if (indiceActual >= 0 && productos[indiceActual]) {
        progreso.textContent = `${productos[indiceActual].nombre} — posición ${indiceActual + 1} de ${productos.length}.`;
      }
    };
    manija.addEventListener('pointerdown', empezar);
    manija.addEventListener('pointermove', mover);
    manija.addEventListener('pointerup', terminar);
    manija.addEventListener('pointercancel', terminar);
  }

  async function generarMiniaturas(miGeneracion) {
    urlsMiniatura.forEach((u) => URL.revokeObjectURL(u));
    urlsMiniatura = [];
    carrusel.textContent = '';
    const items = productos.map((producto) => crearItemCarrusel(producto));
    carrusel.append(...items.map((it) => it.elemento));
    sincronizarDomConProductos();
    progreso.textContent = `Armando ${productos.length === 1 ? 'la vista previa' : `${productos.length} vistas previas`}…`;
    await enParaleloAcotado(productos, CONCURRENCIA_EXPORTACION, async (producto, i) => {
      const datos = await datosParaProducto(producto);
      const blob = await componerMiniatura(datos);
      if (miGeneracion !== generacion) return; // el usuario cambió el estilo antes de terminar
      const url = URL.createObjectURL(blob);
      urlsMiniatura.push(url);
      items[i].img.src = url;
    });
    if (miGeneracion === generacion) progreso.textContent = '';
  }

  /** `productos.map(...)` (nunca el array `resultado`) es lo que se guarda en pantalla y lo que
   * arma `compartirOFallback`: así, si el usuario reordena o descarta MIENTRAS esto todavía se está
   * generando en segundo plano, el resultado tardío no puede pisar un orden/tanda más nueva — el
   * Map se indexa por id de producto, no por posición. */
  async function generarFinales(miGeneracion) {
    const opcionesExportacion = resolverOpcionesExportacion(calidadImagen);
    const resultado = await enParaleloAcotado(productos, CONCURRENCIA_EXPORTACION, async (producto) => {
      const datos = await datosParaProducto(producto);
      const blob = await componerSegunEstilo(datos, opcionesExportacion);
      return { producto, blob };
    });
    if (miGeneracion === generacion) {
      finalesPorId = new Map(resultado.map((f) => [f.producto.id, f.blob]));
      // Para tests (mismo criterio que `window.__editorDebugPlantilla` en plantilla.js): permite
      // verificar qué calidad se usó y cuánto pesó cada archivo final sin depender de mockear
      // `navigator.share`. En el orden ACTUAL de `productos` (puede haber cambiado durante la
      // generación si el usuario reordenó o descartó).
      window.__revisionDebug = {
        calidadImagen,
        opcionesExportacion,
        tamanos: productos.map((p) => finalesPorId.get(p.id)?.size ?? 0),
      };
    }
    return resultado;
  }

  // Las miniaturas se esperan (son lo que ve el usuario); los archivos finales se disparan en
  // SEGUNDO PLANO sin bloquear — `promesaFinales` es lo único que espera "Compartir".
  async function generarTodo() {
    generacion += 1;
    const miGeneracion = generacion;
    btnCompartir.disabled = true;
    await generarMiniaturas(miGeneracion);
    if (miGeneracion !== generacion) return;
    btnCompartir.disabled = false;
    promesaFinales = generarFinales(miGeneracion);
  }

  // Cambiar SOLO la calidad no cambia lo que se ve en las miniaturas (misma composición, otro
  // nivel de compresión del archivo final): no hace falta rehacer el carrusel, alcanza con
  // rearmar los archivos finales en segundo plano — mismo patrón que `generarTodo`, pero sin tocar
  // `generarMiniaturas`.
  async function regenerarFinales() {
    generacion += 1;
    const miGeneracion = generacion;
    btnCompartir.disabled = true;
    promesaFinales = generarFinales(miGeneracion);
    await promesaFinales;
    if (miGeneracion === generacion) btnCompartir.disabled = false;
  }

  selectEstilo.addEventListener('change', async () => {
    estiloSesion = selectEstilo.value || null;
    await generarTodo();
  });

  btnCompartir.addEventListener('click', () => compartirOFallback());

  async function compartirOFallback() {
    btnCompartir.disabled = true;
    const incluirTexto = checkIncluirTexto.checked;
    const texto = incluirTexto ? textareaDescripcion.value : '';
    if (incluirTexto) await copiarDescripcion(texto);

    await promesaFinales;
    // Orden ACTUAL de `productos` (fuente de verdad tras un posible reordenamiento/descarte), blob
    // buscado por id — nunca por posición de un array que pudo haberse generado en otro orden.
    const blobsEnOrden = productos.map((p) => finalesPorId.get(p.id)).filter(Boolean);
    const archivos = blobsEnOrden.map((blob, i) => new File([blob], `estado-${i + 1}.jpg`, { type: 'image/jpeg' }));

    if (puedeCompartirArchivos(archivos)) {
      const resultado = await compartirArchivos({ archivos, texto });
      btnCompartir.disabled = false;
      if (resultado === 'compartido') {
        mostrarToast('¡Listo! Elegí "Mi estado" en WhatsApp');
        cerrar();
      }
      // cancelado/tardando/error ya avisaron por toast dentro de compartirArchivos; se deja
      // la hoja abierta para que se pueda reintentar sin rearmar todo de nuevo.
      return;
    }

    if (puedeCompartirArchivos([archivos[0]])) {
      await compartirDeAUno(archivos, texto);
      return;
    }

    blobsEnOrden.forEach((blob, i) => descargarImagen(blob, `estado-${i + 1}.jpg`));
    mostrarToast(
      blobsEnOrden.length > 1
        ? 'Tu navegador no comparte varios archivos juntos: se descargaron todas'
        : 'Tu navegador no comparte archivos: se descargó la imagen'
    );
    btnCompartir.disabled = false;
    cerrar();
  }

  async function compartirDeAUno(archivos, texto) {
    let i = 0;
    const compartirActual = async () => {
      btnCompartir.disabled = true;
      const resultado = await compartirArchivos({ archivos: [archivos[i]], texto });
      btnCompartir.disabled = false;
      if (resultado !== 'compartido') return; // el toast ya avisó qué pasó; no se avanza solo
      i += 1;
      if (i >= archivos.length) {
        mostrarToast('Listo, se compartieron todas');
        cerrar();
        return;
      }
      btnCompartir.textContent = `Siguiente (${i + 1}/${archivos.length})`;
    };
    btnCompartir.textContent = `Compartir (1/${archivos.length})`;
    btnCompartir.onclick = compartirActual;
    await compartirActual();
  }

  await generarTodo();
}
