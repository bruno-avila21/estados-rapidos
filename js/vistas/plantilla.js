// Editor de plantilla: inspector visual con selección/arrastre/redimensión sobre la vista previa,
// panel de propiedades, capas, deshacer/rehacer y restablecer. Los ajustes que edita acá (posición,
// tipografía, color, fondo/etiqueta, visibilidad de nombre/precio/descripción) son COMPARTIDOS por
// "Foto con precio", "Foto con descripción" y "Mi plantilla" — `foto` solo aplica a "Mi plantilla".
// CREAR-BRIEF.md, ronda 2026-09-27 ("editor de plantilla tipo inspector").
import * as repo from '../repositorio.js';
import { componerSegunEstilo, ANCHO, ALTO } from '../componer.js';
import { elementoEnPunto, moverCaja, redimensionarCaja, aplicarSnap } from '../editor-geometria.js';
import {
  ESTILOS_IMAGEN,
  ETIQUETA_ESTILO,
  FUENTES_DISPONIBLES,
  ETIQUETA_FUENTE,
  AJUSTES_POR_DEFECTO,
  resolverDescripcion,
} from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';

const COLORES_RAPIDOS = ['#ffffff', '#0d0f1a', '#4f46e5', '#a78bfa', '#f5a623', '#3ecf8e'];
const CLAVES_TEXTO = ['nombre', 'precio', 'descripcion'];
const HANDLES = ['nw', 'ne', 'sw', 'se'];

export async function render(contenedor, { navegar } = {}) {
  contenedor.textContent = '';

  const config = await repo.obtenerPlantillaConfig();
  const general = await repo.obtenerAjustesGenerales();
  let ajustes = estructuraClonada(config.ajustes);
  const formatoPrecio = config.formatoPrecio;

  const productos = await repo.listarProductos();
  const productoEjemplo = productos[0] || { nombre: 'Producto de ejemplo', precio: 12500, descripcion: '' };
  const fotoEjemploBlob = productos[0]?.fotoId ? await repo.obtenerFotoBlob(productos[0].fotoId) : null;
  const fotoEjemplo = fotoEjemploBlob ? await createImageBitmap(fotoEjemploBlob) : null;
  const descripcionEjemplo = resolverDescripcion(productoEjemplo, { ...general, formatoPrecio });

  let estiloPreview = general.estiloGeneral;
  let seleccion = null;
  let urlPreviaActual = null;
  let regenerando = false;
  let pendienteRegenerar = false;

  const historial = [estructuraClonada(ajustes)];
  let indiceHistorial = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pila editor-plantilla';

  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'boton boton--fantasma boton--chico';
  btnVolver.setAttribute('data-accion', 'ir-ajustes');
  btnVolver.textContent = '← Volver a Ajustes';
  btnVolver.addEventListener('click', () => navegar?.('#/ajustes'));

  // --- Selector de qué estilo previsualizar (el editor comparte ajustes entre los 3 con texto) ---
  const selectorEstilo = document.createElement('div');
  selectorEstilo.className = 'campo';
  const labelEstilo = document.createElement('label');
  labelEstilo.className = 'campo__etiqueta';
  labelEstilo.htmlFor = 'editor-vista-previa-estilo';
  labelEstilo.textContent = 'Vista previa de';
  const selectEstilo = document.createElement('select');
  selectEstilo.id = 'editor-vista-previa-estilo';
  selectEstilo.setAttribute('data-accion', 'editor-estilo-preview');
  for (const valor of ESTILOS_IMAGEN) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = ETIQUETA_ESTILO[valor];
    if (valor === estiloPreview) opcion.selected = true;
    selectEstilo.append(opcion);
  }
  selectEstilo.addEventListener('change', () => {
    estiloPreview = selectEstilo.value;
    dibujarOverlay();
    regenerarPrevia();
  });
  selectorEstilo.append(labelEstilo, selectEstilo);

  // --- Subida de fondo propio (solo relevante para "Mi plantilla") ---
  const grupoSubida = document.createElement('div');
  grupoSubida.className = 'fila';
  const inputPlantilla = document.createElement('input');
  inputPlantilla.type = 'file';
  inputPlantilla.accept = 'image/png';
  inputPlantilla.className = 'campo-oculto';
  inputPlantilla.tabIndex = -1;
  inputPlantilla.setAttribute('data-accion-input', 'subir-plantilla');
  const btnSubir = document.createElement('button');
  btnSubir.type = 'button';
  btnSubir.className = 'boton boton--chico';
  btnSubir.setAttribute('data-accion', 'subir-plantilla');
  btnSubir.textContent = 'Subir mi fondo (PNG 1080×1920)';
  btnSubir.addEventListener('click', () => inputPlantilla.click());
  let plantillaImagenActual = await createImageBitmap(await repo.obtenerImagenPlantillaBlob());
  inputPlantilla.addEventListener('change', async (ev) => {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    await repo.guardarImagenPlantilla(archivo);
    plantillaImagenActual = await createImageBitmap(archivo);
    mostrarToast('Fondo actualizado');
    regenerarPrevia();
  });
  grupoSubida.append(btnSubir, inputPlantilla);

  // --- Vista previa + overlay interactivo ---
  const previaContenedor = document.createElement('div');
  previaContenedor.className = 'previa-plantilla editor-plantilla__lienzo';
  const previa = document.createElement('img');
  previa.className = 'editor-plantilla__imagen';
  previa.alt = 'Vista previa editable';
  const overlay = document.createElement('div');
  overlay.className = 'editor-plantilla__overlay';
  previaContenedor.append(previa, overlay);

  // --- Capas ---
  const capas = document.createElement('div');
  capas.className = 'editor-plantilla__capas';

  // --- Panel de propiedades ---
  const panel = document.createElement('div');
  panel.className = 'grupo editor-plantilla__panel';
  panel.hidden = true;

  // --- Deshacer / rehacer / restablecer ---
  const filaHistorial = document.createElement('div');
  filaHistorial.className = 'fila';
  const btnDeshacer = document.createElement('button');
  btnDeshacer.type = 'button';
  btnDeshacer.className = 'boton boton--chico';
  btnDeshacer.setAttribute('data-accion', 'deshacer');
  btnDeshacer.textContent = '↶ Deshacer';
  const btnRehacer = document.createElement('button');
  btnRehacer.type = 'button';
  btnRehacer.className = 'boton boton--chico';
  btnRehacer.setAttribute('data-accion', 'rehacer');
  btnRehacer.textContent = '↷ Rehacer';
  const btnRestablecer = document.createElement('button');
  btnRestablecer.type = 'button';
  btnRestablecer.className = 'boton boton--chico boton--fantasma';
  btnRestablecer.setAttribute('data-accion', 'restablecer-plantilla');
  btnRestablecer.textContent = 'Restablecer';
  filaHistorial.append(btnDeshacer, btnRehacer, btnRestablecer);

  wrap.append(btnVolver, selectorEstilo, grupoSubida, previaContenedor, capas, panel, filaHistorial);
  contenedor.append(wrap);

  actualizarBotonesHistorial();
  dibujarOverlay();
  await regenerarPrevia();

  // ================= Lógica =================

  function clavesVisiblesParaEstilo() {
    return estiloPreview === 'mi-plantilla' ? ['foto', ...CLAVES_TEXTO] : CLAVES_TEXTO;
  }

  function cajasHitTest() {
    return clavesVisiblesParaEstilo().map((clave) => ({ clave, ...ajustes[clave] }));
  }

  async function regenerarPrevia() {
    if (regenerando) {
      pendienteRegenerar = true;
      return;
    }
    regenerando = true;
    try {
      const blob = await componerSegunEstilo({
        estilo: estiloPreview,
        plantillaImagen: plantillaImagenActual,
        fotoImagen: fotoEjemplo,
        producto: productoEjemplo,
        ajustes,
        formatoPrecio,
        descripcion: descripcionEjemplo,
      });
      const url = URL.createObjectURL(blob);
      const anterior = urlPreviaActual;
      previa.src = url;
      urlPreviaActual = url;
      if (anterior) URL.revokeObjectURL(anterior);
    } catch (error) {
      mostrarToast('No se pudo actualizar la vista previa: ' + error.message);
    } finally {
      regenerando = false;
      if (pendienteRegenerar) {
        pendienteRegenerar = false;
        regenerarPrevia();
      }
    }
  }

  function dibujarOverlay() {
    overlay.textContent = '';
    const claves = clavesVisiblesParaEstilo();

    capas.textContent = '';
    const tituloCapas = document.createElement('div');
    tituloCapas.className = 'grupo__titulo';
    tituloCapas.textContent = 'Capas';
    capas.append(tituloCapas);

    for (const clave of claves) {
      const caja = ajustes[clave];
      const div = document.createElement('div');
      div.className = 'editor-plantilla__caja' + (seleccion === clave ? ' editor-plantilla__caja--activa' : '');
      if (caja.visible === false) div.classList.add('editor-plantilla__caja--oculta');
      div.setAttribute('data-elemento', clave); // para tests: clic directo sobre el elemento en el lienzo
      posicionarEnPx(div, caja);
      div.addEventListener('pointerdown', (ev) => alPointerDownCaja(ev, clave));
      if (seleccion === clave) {
        for (const manija of HANDLES) {
          const h = document.createElement('div');
          h.className = `editor-plantilla__manija editor-plantilla__manija--${manija}`;
          h.addEventListener('pointerdown', (ev) => alPointerDownManija(ev, clave, manija));
          div.append(h);
        }
      }
      overlay.append(div);

      const btnCapa = document.createElement('button');
      btnCapa.type = 'button';
      btnCapa.className = 'boton boton--chico' + (seleccion === clave ? ' tarjeta-estilo--activa' : '');
      btnCapa.setAttribute('data-accion', `capa-${clave}`);
      btnCapa.textContent = etiquetaCaja(clave) + (caja.visible === false ? ' (oculto)' : '');
      btnCapa.addEventListener('click', () => seleccionar(clave));
      capas.append(btnCapa);
    }

    dibujarPanel();
  }

  function etiquetaCaja(clave) {
    return { foto: 'Foto', nombre: 'Nombre', precio: 'Precio', descripcion: 'Descripción' }[clave];
  }

  function posicionarEnPx(div, caja) {
    div.style.left = `${(caja.x / ANCHO) * 100}%`;
    div.style.top = `${(caja.y / ALTO) * 100}%`;
    div.style.width = `${(caja.w / ANCHO) * 100}%`;
    div.style.height = `${(caja.h / ALTO) * 100}%`;
  }

  overlay.addEventListener('pointerdown', (ev) => {
    if (ev.target !== overlay) return; // ya lo maneja alPointerDownCaja si tocó una caja
    const punto = puntoDesdeEvento(ev);
    const clave = elementoEnPunto(cajasHitTest(), punto.x, punto.y);
    seleccionar(clave);
  });

  function puntoDesdeEvento(ev) {
    const rect = overlay.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * ANCHO,
      y: ((ev.clientY - rect.top) / rect.height) * ALTO,
    };
  }

  function seleccionar(clave) {
    seleccion = clave;
    dibujarOverlay();
  }

  function alPointerDownCaja(ev, clave) {
    ev.stopPropagation();
    ev.preventDefault();
    seleccion = clave;
    const inicio = puntoDesdeEvento(ev);
    const cajaInicial = { ...ajustes[clave] };
    const alMover = (evMove) => {
      const actual = puntoDesdeEvento(evMove);
      let nueva = moverCaja(cajaInicial, actual.x - inicio.x, actual.y - inicio.y, { w: ANCHO, h: ALTO });
      const { caja: conSnap } = aplicarSnap(nueva, { w: ANCHO, h: ALTO });
      ajustes[clave] = { ...ajustes[clave], x: conSnap.x, y: conSnap.y };
      dibujarOverlay();
      regenerarPrevia();
    };
    const alSoltar = () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      guardarEnHistorial();
    };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    dibujarOverlay();
  }

  function alPointerDownManija(ev, clave, manija) {
    ev.stopPropagation();
    ev.preventDefault();
    const inicio = puntoDesdeEvento(ev);
    const cajaInicial = { ...ajustes[clave] };
    const alMover = (evMove) => {
      const actual = puntoDesdeEvento(evMove);
      const nueva = redimensionarCaja(cajaInicial, manija, actual.x - inicio.x, actual.y - inicio.y, { w: ANCHO, h: ALTO });
      ajustes[clave] = { ...ajustes[clave], ...nueva };
      dibujarOverlay();
      regenerarPrevia();
    };
    const alSoltar = () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      guardarEnHistorial();
    };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
  }

  function dibujarPanel() {
    panel.textContent = '';
    if (!seleccion || seleccion === 'foto') {
      panel.hidden = true;
      return;
    }
    panel.hidden = false;
    const caja = ajustes[seleccion];

    const titulo = document.createElement('div');
    titulo.className = 'grupo__titulo';
    titulo.textContent = `Propiedades — ${etiquetaCaja(seleccion)}`;
    panel.append(titulo);

    panel.append(campoRangoNumero('Tamaño de letra', caja.tamano, 16, 160, (v) => actualizarCampo('tamano', v, true)));

    const campoFuente = document.createElement('div');
    campoFuente.className = 'campo';
    const labelFuente = document.createElement('label');
    labelFuente.className = 'campo__etiqueta';
    labelFuente.textContent = 'Tipografía';
    const selectFuente = document.createElement('select');
    selectFuente.setAttribute('data-accion', 'editor-fuente');
    for (const clave of FUENTES_DISPONIBLES) {
      const opcion = document.createElement('option');
      opcion.value = clave;
      opcion.textContent = ETIQUETA_FUENTE[clave];
      if (clave === caja.familia) opcion.selected = true;
      selectFuente.append(opcion);
    }
    selectFuente.addEventListener('change', () => actualizarCampo('familia', selectFuente.value, true));
    campoFuente.append(labelFuente, selectFuente);
    panel.append(campoFuente);

    const filaPeso = document.createElement('div');
    filaPeso.className = 'fila';
    for (const [etiqueta, valor] of [['Normal', 400], ['Negrita', 800]]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boton boton--chico' + (caja.peso === valor ? ' tarjeta-estilo--activa' : '');
      btn.textContent = etiqueta;
      btn.setAttribute('data-accion', `editor-peso-${valor}`);
      btn.addEventListener('click', () => actualizarCampo('peso', valor, true));
      filaPeso.append(btn);
    }
    panel.append(filaPeso);

    const filaAlineacion = document.createElement('div');
    filaAlineacion.className = 'fila';
    for (const [etiqueta, valor] of [['Izquierda', 'left'], ['Centro', 'center'], ['Derecha', 'right']]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'boton boton--chico' + (caja.alineacion === valor ? ' tarjeta-estilo--activa' : '');
      btn.textContent = etiqueta;
      btn.setAttribute('data-accion', `editor-alineacion-${valor}`);
      btn.addEventListener('click', () => actualizarCampo('alineacion', valor, true));
      filaAlineacion.append(btn);
    }
    panel.append(filaAlineacion);

    panel.append(campoColor('Color del texto', caja.color, (v) => actualizarCampo('color', v, true)));

    const tituloFondo = document.createElement('div');
    tituloFondo.className = 'grupo__titulo';
    tituloFondo.textContent = 'Fondo / etiqueta';
    panel.append(tituloFondo);
    panel.append(campoColor('Color de fondo', caja.fondoColor, (v) => actualizarCampo('fondoColor', v, true)));
    panel.append(
      campoRangoNumero('Opacidad del fondo', Math.round((caja.fondoOpacidad ?? 0) * 100), 0, 100, (v) =>
        actualizarCampo('fondoOpacidad', v / 100, true)
      )
    );
    panel.append(campoRangoNumero('Redondeo del fondo', caja.fondoRadio ?? 0, 0, 60, (v) => actualizarCampo('fondoRadio', v, true)));

    const campoVisible = document.createElement('label');
    campoVisible.className = 'fila';
    campoVisible.style.alignItems = 'center';
    const checkVisible = document.createElement('input');
    checkVisible.type = 'checkbox';
    checkVisible.checked = caja.visible !== false;
    checkVisible.setAttribute('data-accion', 'editor-visible');
    checkVisible.addEventListener('change', () => actualizarCampo('visible', checkVisible.checked, true));
    const spanVisible = document.createElement('span');
    spanVisible.textContent = 'Visible';
    campoVisible.append(checkVisible, spanVisible);
    panel.append(campoVisible);
  }

  function campoRangoNumero(etiqueta, valor, min, max, onCambio) {
    const div = document.createElement('div');
    div.className = 'campo';
    const label = document.createElement('label');
    label.className = 'campo__etiqueta';
    label.textContent = etiqueta;
    const fila = document.createElement('div');
    fila.className = 'deslizador';
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.value = String(valor);
    const numero = document.createElement('input');
    numero.type = 'number';
    numero.min = String(min);
    numero.max = String(max);
    numero.value = String(valor);
    numero.className = 'editor-plantilla__numero';
    const sincronizar = (v) => {
      input.value = String(v);
      numero.value = String(v);
      onCambio(v);
    };
    input.addEventListener('input', () => sincronizar(Number(input.value)));
    numero.addEventListener('input', () => sincronizar(Number(numero.value)));
    fila.append(input, numero);
    div.append(label, fila);
    return div;
  }

  function campoColor(etiqueta, valor, onCambio) {
    const div = document.createElement('div');
    div.className = 'campo';
    const label = document.createElement('label');
    label.className = 'campo__etiqueta';
    label.textContent = etiqueta;
    const fila = document.createElement('div');
    fila.className = 'editor-plantilla__colores';
    for (const rapido of COLORES_RAPIDOS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'editor-plantilla__swatch';
      swatch.style.background = rapido;
      swatch.setAttribute('aria-label', `Color ${rapido}`);
      swatch.addEventListener('click', () => {
        input.value = rapido;
        onCambio(rapido);
      });
      fila.append(swatch);
    }
    const input = document.createElement('input');
    input.type = 'color';
    input.value = valor || '#ffffff';
    input.addEventListener('input', () => onCambio(input.value));
    fila.append(input);
    div.append(label, fila);
    return div;
  }

  let debounceGuardado = null;
  function actualizarCampo(campo, valor, regenerarInmediato) {
    ajustes[seleccion] = { ...ajustes[seleccion], [campo]: valor };
    if (regenerarInmediato) regenerarPrevia();
    dibujarOverlay();
    clearTimeout(debounceGuardado);
    debounceGuardado = setTimeout(guardarEnHistorial, 400);
  }

  function guardarEnHistorial() {
    persistir();
    historial.splice(indiceHistorial + 1);
    historial.push(estructuraClonada(ajustes));
    indiceHistorial = historial.length - 1;
    actualizarBotonesHistorial();
  }

  function persistir() {
    repo.guardarAjustesPlantilla(ajustes);
  }

  btnDeshacer.addEventListener('click', () => {
    if (indiceHistorial === 0) return;
    indiceHistorial -= 1;
    ajustes = estructuraClonada(historial[indiceHistorial]);
    persistir();
    dibujarOverlay();
    regenerarPrevia();
    actualizarBotonesHistorial();
  });
  btnRehacer.addEventListener('click', () => {
    if (indiceHistorial === historial.length - 1) return;
    indiceHistorial += 1;
    ajustes = estructuraClonada(historial[indiceHistorial]);
    persistir();
    dibujarOverlay();
    regenerarPrevia();
    actualizarBotonesHistorial();
  });
  btnRestablecer.addEventListener('click', async () => {
    const ok = await pedirConfirmacion({
      titulo: 'Restablecer plantilla',
      mensaje: 'Vuelve la posición, tipografía y color de nombre, precio y descripción a los valores de fábrica. No se puede deshacer con "Deshacer" una vez guardado.',
      textoConfirmar: 'Restablecer',
    });
    if (!ok) return;
    ajustes = estructuraClonada(AJUSTES_POR_DEFECTO);
    seleccion = null;
    persistir();
    guardarEnHistorial();
    dibujarOverlay();
    regenerarPrevia();
    mostrarToast('Plantilla restablecida');
  });

  function actualizarBotonesHistorial() {
    btnDeshacer.disabled = indiceHistorial === 0;
    btnRehacer.disabled = indiceHistorial === historial.length - 1;
  }
}

function estructuraClonada(obj) {
  return JSON.parse(JSON.stringify(obj));
}
