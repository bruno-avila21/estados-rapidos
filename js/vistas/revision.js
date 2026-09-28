// Hoja de revisión: antes de compartir (1 o N productos), arma las imágenes con progreso, deja
// editar la descripción y elegir el estilo, un interruptor para compartir SIN texto, y comparte
// todo junto (o de a uno si el navegador no soporta compartir varios archivos), con descarga como
// último recurso. CREAR-BRIEF.md, cambio de producto 2026-09-27; ronda "publicar más rápido" y
// "compartir sin texto" 2026-09-28.
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

export const LIMITE_IMAGENES = 30;
const CONCURRENCIA_EXPORTACION = 3; // "en paralelo ACOTADO": no decodificar/comprimir todo a la vez

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

  const productos = [];
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
  let finales = []; // [{producto, blob}] — archivos FINALES (1080x1920 JPEG), pre-generados
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
  overlay.className = 'dialogo-overlay';
  const caja = document.createElement('div');
  caja.className = 'dialogo hoja-revision';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  caja.setAttribute('aria-label', 'Revisar antes de publicar');

  const titulo = document.createElement('h2');
  titulo.className = 'dialogo__titulo';
  titulo.textContent = productos.length === 1 ? 'Revisar antes de publicar' : `Revisar ${productos.length} productos`;

  const progreso = document.createElement('p');
  progreso.className = 'texto-tenue';
  progreso.setAttribute('role', 'status');

  const carrusel = document.createElement('div');
  carrusel.className = 'hoja-revision__carrusel';

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

  // --- Calidad de imagen (Fase 2, "S" #5): "Estándar" (JPEG 0.85, más liviana y rápida de armar/
  // compartir) o "Alta" (JPEG 0.95, mejor nitidez). Nunca PNG: WhatsApp recomprime igual la imagen
  // que reciba, así que un PNG sin pérdida solo suma peso y tiempo sin ganancia real (medido en
  // modelo.js, junto a OPCIONES_EXPORTACION_POR_CALIDAD). Se recuerda entre hojas de revisión. ---
  const campoCalidad = document.createElement('div');
  campoCalidad.className = 'campo';
  const labelCalidad = document.createElement('span');
  labelCalidad.className = 'campo__etiqueta';
  labelCalidad.textContent = 'Calidad de imagen';
  const filaCalidad = document.createElement('div');
  filaCalidad.className = 'fila';
  const botonesCalidad = {};
  for (const valor of CALIDADES_IMAGEN) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (calidadImagen === valor ? ' chip--activo' : '');
    btn.setAttribute('data-accion', `revision-calidad-${valor}`);
    btn.setAttribute('aria-pressed', String(calidadImagen === valor));
    btn.textContent = ETIQUETA_CALIDAD_IMAGEN[valor];
    btn.addEventListener('click', async () => {
      if (calidadImagen === valor) return;
      calidadImagen = valor;
      for (const v of CALIDADES_IMAGEN) {
        botonesCalidad[v].classList.toggle('chip--activo', v === valor);
        botonesCalidad[v].setAttribute('aria-pressed', String(v === valor));
      }
      await repo.guardarCalidadImagen(valor);
      await regenerarFinales();
    });
    botonesCalidad[valor] = btn;
    filaCalidad.append(btn);
  }
  const ayudaCalidad = document.createElement('p');
  ayudaCalidad.className = 'texto-tenue';
  ayudaCalidad.textContent =
    'Estándar: más rápida de armar y compartir. Alta: mejor nitidez, pesa más (WhatsApp igual la recomprime al recibirla).';
  campoCalidad.append(labelCalidad, filaCalidad, ayudaCalidad);

  // --- "Incluir texto" (ronda "compartir sin texto"): apagado, no se copia al portapapeles ni se
  // manda como EXTRA_TEXT/text; se recuerda la última elección en Ajustes generales. ---
  const campoIncluirTexto = document.createElement('label');
  campoIncluirTexto.className = 'fila';
  campoIncluirTexto.style.alignItems = 'center';
  const checkIncluirTexto = document.createElement('input');
  checkIncluirTexto.type = 'checkbox';
  checkIncluirTexto.id = 'revision-incluir-texto';
  checkIncluirTexto.setAttribute('data-accion', 'revision-incluir-texto');
  checkIncluirTexto.checked = general.incluirTextoAlCompartir !== false;
  const spanIncluirTexto = document.createElement('span');
  spanIncluirTexto.textContent = 'Incluir texto';
  campoIncluirTexto.append(checkIncluirTexto, spanIncluirTexto);

  const campoDescripcion = document.createElement('div');
  campoDescripcion.className = 'campo';
  const labelDescripcion = document.createElement('label');
  labelDescripcion.className = 'campo__etiqueta';
  labelDescripcion.htmlFor = 'revision-descripcion';
  labelDescripcion.textContent =
    productos.length === 1 ? 'Descripción' : 'Descripción (una por línea, se comparte como un solo texto)';
  const textareaDescripcion = document.createElement('textarea');
  textareaDescripcion.id = 'revision-descripcion';
  textareaDescripcion.value = productos.map((p) => resolverDescripcion(p, { ...general, formatoPrecio: plantillaConfig.formatoPrecio })).join('\n');

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

  campoDescripcion.append(labelDescripcion, textareaDescripcion, btnCopiarDescripcion);

  function actualizarEstadoIncluirTexto() {
    textareaDescripcion.disabled = !checkIncluirTexto.checked;
  }
  actualizarEstadoIncluirTexto();
  checkIncluirTexto.addEventListener('change', async () => {
    actualizarEstadoIncluirTexto();
    await repo.guardarIncluirTextoAlCompartir(checkIncluirTexto.checked);
  });

  const acciones = document.createElement('div');
  acciones.className = 'dialogo__acciones';
  const btnCerrar = document.createElement('button');
  btnCerrar.type = 'button';
  btnCerrar.className = 'boton boton--fantasma';
  btnCerrar.setAttribute('data-accion', 'revision-cerrar');
  btnCerrar.textContent = 'Cerrar';
  const btnCompartir = document.createElement('button');
  btnCompartir.type = 'button';
  btnCompartir.className = 'boton boton--primario';
  btnCompartir.setAttribute('data-accion', 'revision-compartir');
  btnCompartir.textContent = 'Compartir';
  acciones.append(btnCerrar, btnCompartir);

  caja.append(titulo, progreso, carrusel, campoEstilo, campoCalidad, campoIncluirTexto, campoDescripcion, acciones);
  overlay.append(caja);
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

  async function generarMiniaturas(miGeneracion) {
    urlsMiniatura.forEach((u) => URL.revokeObjectURL(u));
    urlsMiniatura = [];
    carrusel.textContent = '';
    const imgs = productos.map((producto) => {
      const img = document.createElement('img');
      img.className = 'hoja-revision__miniatura';
      img.alt = producto.nombre;
      carrusel.append(img);
      return img;
    });
    progreso.textContent = `Armando ${productos.length === 1 ? 'la vista previa' : `${productos.length} vistas previas`}…`;
    await enParaleloAcotado(productos, CONCURRENCIA_EXPORTACION, async (producto, i) => {
      const datos = await datosParaProducto(producto);
      const blob = await componerMiniatura(datos);
      if (miGeneracion !== generacion) return; // el usuario cambió el estilo antes de terminar
      const url = URL.createObjectURL(blob);
      urlsMiniatura.push(url);
      imgs[i].src = url;
    });
    if (miGeneracion === generacion) progreso.textContent = '';
  }

  async function generarFinales(miGeneracion) {
    const opcionesExportacion = resolverOpcionesExportacion(calidadImagen);
    const resultado = await enParaleloAcotado(productos, CONCURRENCIA_EXPORTACION, async (producto) => {
      const datos = await datosParaProducto(producto);
      const blob = await componerSegunEstilo(datos, opcionesExportacion);
      return { producto, blob };
    });
    if (miGeneracion === generacion) {
      finales = resultado;
      // Para tests (mismo criterio que `window.__editorDebugPlantilla` en plantilla.js): permite
      // verificar qué calidad se usó y cuánto pesó cada archivo final sin depender de mockear
      // `navigator.share`.
      window.__revisionDebug = { calidadImagen, opcionesExportacion, tamanos: resultado.map((f) => f.blob.size) };
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
    const archivos = finales.map((f, i) => new File([f.blob], `estado-${i + 1}.jpg`, { type: 'image/jpeg' }));

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

    finales.forEach((f, i) => descargarImagen(f.blob, `estado-${i + 1}.jpg`));
    mostrarToast(
      finales.length > 1
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
