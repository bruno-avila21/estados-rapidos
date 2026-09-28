// Editor de plantilla: inspector visual con selección/arrastre/redimensión sobre la vista previa,
// panel de propiedades, capas (con ojo mostrar/ocultar), deshacer/rehacer, "Acomodar" y "Volver al
// original de este estilo". CREAR-BRIEF.md, ronda 2026-09-27 ("editor de plantilla tipo
// inspector"), ronda de distribución, y ronda "ajustes por estilo" (2026-09-28).
//
// Ronda "ajustes por estilo": el editor deja de compartir UN juego de ajustes entre los 3 estilos
// con texto — edita SIEMPRE un solo estilo a la vez (`estiloEditando`, elegido por `?estilo=` en
// el hash o, si no vino, el estilo general si es editable, si no el primero de la lista). El
// selector ya no es una "vista previa" que no persiste: cambiarlo navega al editor de OTRO estilo
// (`#/plantilla?estilo=…`), cada uno con su propio historial de deshacer/rehacer. "Solo la foto"
// no tiene ajustes propios y no aparece en el selector.
//
// Vista previa EN VIVO (ronda "vista previa en vivo de verdad"): antes cada `pointermove` armaba
// un PNG completo (`canvas.toBlob`) y lo mostraba en un `<img>` — en el celu tardaba lo bastante
// como para que el recuadro (que sí se movía al instante) fuera adelante de la imagen. Ahora la
// vista previa es un `<canvas>` visible donde se dibuja DIRECTO con `dibujarSegunEstilo` (la misma
// lógica de composición, separada de la exportación en componer.js), coalescido con
// `requestAnimationFrame` (máximo 1 dibujo por frame) y a resolución de pantalla (ancho CSS ×
// devicePixelRatio, escalando el contexto — las coordenadas siguen siendo las lógicas 1080×1920).
import * as repo from '../repositorio.js';
import { dibujarSegunEstilo, ANCHO, ALTO } from '../componer.js';
import { cargarFuentes } from '../fuentes.js';
import { elementoEnPunto, moverCaja, redimensionarCaja, aplicarSnap, acomodarAutomatico } from '../editor-geometria.js';
import {
  ESTILOS_CON_AJUSTES,
  ETIQUETA_ESTILO,
  FUENTES_DISPONIBLES,
  ETIQUETA_FUENTE,
  AJUSTES_POR_DEFECTO_POR_ESTILO,
  esAjustePersonalizado,
  resolverDescripcion,
} from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { crearIcono } from '../utils/iconos.js';
import { mostrarToast } from '../utils/toast.js';

const COLORES_RAPIDOS = ['#ffffff', '#242220', '#3a4d39', '#6e5b49', '#f5a623', '#3f5c38'];
const CLAVES_TEXTO = ['nombre', 'precio', 'descripcion'];
const HANDLES = ['nw', 'ne', 'sw', 'se'];

export async function render(contenedor, { navegar, params } = {}) {
  contenedor.textContent = '';

  const config = await repo.obtenerPlantillaConfig();
  const general = await repo.obtenerAjustesGenerales();

  // Qué estilo se edita: el de la URL si es válido, si no el general (si es editable), si no el
  // primero de la lista. "Solo la foto" nunca es editable acá.
  const estiloParam = params?.query?.get('estilo');
  const estiloEditando = ESTILOS_CON_AJUSTES.includes(estiloParam)
    ? estiloParam
    : ESTILOS_CON_AJUSTES.includes(general.estiloGeneral)
      ? general.estiloGeneral
      : ESTILOS_CON_AJUSTES[0];

  let ajustes = estructuraClonada(config.ajustesPorEstilo[estiloEditando]);
  const formatoPrecio = config.formatoPrecio;

  const productos = await repo.listarProductos();
  const productoEjemplo = productos[0] || { nombre: 'Producto de ejemplo', precio: 12500, descripcion: '' };
  const fotoEjemploBlob = productos[0]?.fotoId ? await repo.obtenerFotoBlob(productos[0].fotoId) : null;
  const fotoEjemplo = fotoEjemploBlob ? await createImageBitmap(fotoEjemploBlob) : null;
  const descripcionEjemplo = resolverDescripcion(productoEjemplo, { ...general, formatoPrecio });

  await cargarFuentes(); // una sola vez: dibujarSegunEstilo es síncrona, asume fuentes ya listas

  let seleccion = null;
  // Declarados acá (y no más abajo, junto a `solicitarRedibujo`) para que la llamada inicial de
  // más abajo no choque con la zona muerta temporal de `let` (TDZ): las funciones declaradas con
  // `function` se hoistean enteras, pero un `let` no se puede leer antes de su propia línea.
  let rafPendiente = false;
  let contadorDibujos = 0;

  const historial = [estructuraClonada(ajustes)];
  let indiceHistorial = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pila editor-plantilla';

  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'boton boton--fantasma boton--chico';
  btnVolver.setAttribute('data-accion', 'ir-ajustes');
  btnVolver.append(crearIcono('volver'), document.createTextNode('Volver a Ajustes'));
  btnVolver.addEventListener('click', () => navegar?.('#/ajustes'));

  // --- Selector de CUÁL estilo se edita (ya no una "vista previa" sin persistir: cada estilo
  // tiene su propia configuración — cambiarlo navega al editor de ese otro estilo) ---
  const selectorEstilo = document.createElement('div');
  selectorEstilo.className = 'campo';
  const filaLabelEstilo = document.createElement('div');
  filaLabelEstilo.className = 'fila';
  filaLabelEstilo.style.alignItems = 'center';
  filaLabelEstilo.style.justifyContent = 'space-between';
  const labelEstilo = document.createElement('label');
  labelEstilo.className = 'campo__etiqueta';
  labelEstilo.htmlFor = 'editor-vista-previa-estilo';
  labelEstilo.textContent = 'Estilo que estás editando';
  const badgePersonalizado = document.createElement('span');
  badgePersonalizado.className = 'editor-plantilla__badge';
  badgePersonalizado.textContent = 'Personalizado';
  badgePersonalizado.hidden = true;
  filaLabelEstilo.append(labelEstilo, badgePersonalizado);
  const selectEstilo = document.createElement('select');
  selectEstilo.id = 'editor-vista-previa-estilo';
  selectEstilo.setAttribute('data-accion', 'editor-estilo-preview');
  for (const valor of ESTILOS_CON_AJUSTES) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = ETIQUETA_ESTILO[valor];
    if (valor === estiloEditando) opcion.selected = true;
    selectEstilo.append(opcion);
  }
  selectEstilo.addEventListener('change', () => {
    if (selectEstilo.value === estiloEditando) return;
    navegar(`#/plantilla?estilo=${selectEstilo.value}`);
  });
  selectorEstilo.append(filaLabelEstilo, selectEstilo);

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
    solicitarRedibujo();
  });
  grupoSubida.append(btnSubir, inputPlantilla);
  if (estiloEditando !== 'mi-plantilla') grupoSubida.hidden = true;

  // --- Vista previa (canvas en vivo) + overlay interactivo ---
  const previaContenedor = document.createElement('div');
  previaContenedor.className = 'previa-plantilla editor-plantilla__lienzo';
  const previaCanvas = document.createElement('canvas');
  previaCanvas.className = 'editor-plantilla__imagen';
  const ctxPrevia = previaCanvas.getContext('2d');
  const overlay = document.createElement('div');
  overlay.className = 'editor-plantilla__overlay';
  previaContenedor.append(previaCanvas, overlay);

  // --- Capas ---
  const capas = document.createElement('div');
  capas.className = 'editor-plantilla__capas';

  // --- Panel de propiedades ---
  const panel = document.createElement('div');
  panel.className = 'grupo editor-plantilla__panel';
  panel.hidden = true;

  // --- Deshacer / rehacer / Acomodar / Volver al original de este estilo ---
  // Barra fija arriba del lienzo, en grilla 2×2 (entra en 360-412px sin scroll horizontal: con
  // 4 botones en fila el último quedaba cortado a la derecha, BUGS.md ronda "editor en el celular").
  // Además siempre a mano: abajo del panel quedaba a casi dos pantallas, y en el celu un toque que
  // cae mientras la página todavía se desliza se usa para frenar el scroll y no llega como click
  // (QA v4, BUGS.md #18).
  const filaHistorial = document.createElement('div');
  filaHistorial.className = 'editor-plantilla__barra';
  const btnDeshacer = document.createElement('button');
  btnDeshacer.type = 'button';
  btnDeshacer.className = 'boton boton--chico';
  btnDeshacer.setAttribute('data-accion', 'deshacer');
  btnDeshacer.append(crearIcono('deshacer'), document.createTextNode('Deshacer'));
  const btnRehacer = document.createElement('button');
  btnRehacer.type = 'button';
  btnRehacer.className = 'boton boton--chico';
  btnRehacer.setAttribute('data-accion', 'rehacer');
  btnRehacer.append(crearIcono('rehacer'), document.createTextNode('Rehacer'));
  const btnAcomodar = document.createElement('button');
  btnAcomodar.type = 'button';
  btnAcomodar.className = 'boton boton--chico';
  btnAcomodar.setAttribute('data-accion', 'acomodar-automatico');
  btnAcomodar.textContent = 'Acomodar';
  const btnRestablecer = document.createElement('button');
  btnRestablecer.type = 'button';
  btnRestablecer.className = 'boton boton--chico boton--fantasma';
  btnRestablecer.setAttribute('data-accion', 'restablecer-plantilla');
  btnRestablecer.textContent = 'Restablecer';
  filaHistorial.append(btnDeshacer, btnRehacer, btnAcomodar, btnRestablecer);

  wrap.append(btnVolver, selectorEstilo, grupoSubida, filaHistorial, previaContenedor, capas, panel);
  contenedor.append(wrap);

  actualizarBotonesHistorial();
  dibujarOverlay();
  ajustarResolucionCanvas();
  solicitarRedibujo();

  const resizeObserver = new ResizeObserver(() => {
    ajustarResolucionCanvas();
    solicitarRedibujo();
  });
  resizeObserver.observe(previaContenedor);

  // ================= Lógica =================

  function clavesVisiblesParaEstilo() {
    return estiloEditando === 'mi-plantilla' ? ['foto', ...CLAVES_TEXTO] : CLAVES_TEXTO;
  }

  function cajasHitTest() {
    return clavesVisiblesParaEstilo().map((clave) => ({ clave, ...ajustes[clave] }));
  }

  function ajustarResolucionCanvas() {
    const rect = previaContenedor.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const dpr = window.devicePixelRatio || 1;
    const anchoPx = Math.max(1, Math.round(rect.width * dpr));
    const altoPx = Math.max(1, Math.round(rect.height * dpr));
    if (previaCanvas.width === anchoPx && previaCanvas.height === altoPx) return;
    previaCanvas.width = anchoPx;
    previaCanvas.height = altoPx;
    ctxPrevia.setTransform(anchoPx / ANCHO, 0, 0, altoPx / ALTO, 0, 0);
  }

  // Coalescido con requestAnimationFrame: como mucho un dibujo por frame, sin importar cuántos
  // pointermove lleguen en el medio (antes cada uno armaba un PNG completo — BUGS.md, ronda
  // "vista previa en vivo").
  function solicitarRedibujo() {
    if (rafPendiente) return;
    rafPendiente = true;
    requestAnimationFrame(() => {
      rafPendiente = false;
      pintarLienzo();
    });
  }

  function pintarLienzo() {
    dibujarSegunEstilo(ctxPrevia, {
      estilo: estiloEditando,
      plantillaImagen: plantillaImagenActual,
      fotoImagen: fotoEjemplo,
      producto: productoEjemplo,
      ajustes,
      formatoPrecio,
      descripcion: descripcionEjemplo,
      encuadreFoto: general.encuadreFoto,
    });
    contadorDibujos += 1;
    // Para tests E2E (CREAR-BRIEF.md: "exponer en window para test el último layout dibujado") —
    // permite verificar que lo dibujado en el canvas coincide con el overlay, sin depender de leer
    // píxeles (frágil por antialiasing/fuentes). `revision` sube en cada dibujo real.
    window.__editorDebugPlantilla = {
      revision: contadorDibujos,
      estilo: estiloEditando,
      ajustes: estructuraClonada(ajustes),
    };
  }

  // `conPanel: false` redibuja el overlay/capas pero deja el panel de propiedades como está: si se
  // rehiciera, el deslizador que el dedo está arrastrando se reemplaza por uno nuevo y el gesto se
  // corta después del primer paso (QA v4, BUGS.md).
  function dibujarOverlay({ conPanel = true } = {}) {
    overlay.textContent = '';
    const claves = clavesVisiblesParaEstilo();

    capas.textContent = '';
    const tituloCapas = document.createElement('div');
    tituloCapas.className = 'grupo__titulo';
    tituloCapas.textContent = 'Capas';
    capas.append(tituloCapas);

    for (const clave of claves) {
      const caja = ajustes[clave];
      const oculto = caja.visible === false;
      const div = document.createElement('div');
      div.className = 'editor-plantilla__caja' + (seleccion === clave ? ' editor-plantilla__caja--activa' : '');
      if (oculto) div.classList.add('editor-plantilla__caja--oculta');
      div.setAttribute('data-elemento', clave); // para tests: clic directo sobre el elemento en el lienzo
      posicionarEnPx(div, caja);
      div.addEventListener('pointerdown', (ev) => alPointerDownCaja(ev, clave));
      if (oculto) {
        const etiquetaOculta = document.createElement('span');
        etiquetaOculta.className = 'editor-plantilla__etiqueta-oculta';
        etiquetaOculta.textContent = '(oculto)';
        div.append(etiquetaOculta);
      }
      if (seleccion === clave) {
        for (const manija of HANDLES) {
          const h = document.createElement('div');
          h.className = `editor-plantilla__manija editor-plantilla__manija--${manija}`;
          h.addEventListener('pointerdown', (ev) => alPointerDownManija(ev, clave, manija));
          div.append(h);
        }
      }
      overlay.append(div);

      // Capas: lista VERTICAL, una fila por capa (nombre a lo ancho + ojo a la derecha), ≥48px de
      // alto, la seleccionada resaltada (ronda "capas verticales", CREAR-BRIEF.md 2026-09-28).
      const filaCapa = document.createElement('div');
      filaCapa.className = 'editor-plantilla__fila-capa' + (seleccion === clave ? ' editor-plantilla__fila-capa--activa' : '');

      const btnCapa = document.createElement('button');
      btnCapa.type = 'button';
      btnCapa.className = 'editor-plantilla__fila-capa__nombre';
      btnCapa.setAttribute('data-accion', `capa-${clave}`);
      btnCapa.textContent = etiquetaCaja(clave) + (oculto ? ' (oculto)' : '');
      btnCapa.addEventListener('click', () => seleccionar(clave));

      const btnOjo = document.createElement('button');
      btnOjo.type = 'button';
      btnOjo.className = 'boton boton--chico boton--fantasma editor-plantilla__ojo';
      btnOjo.setAttribute('data-accion', `capa-ojo-${clave}`);
      btnOjo.setAttribute('aria-pressed', String(!oculto)); // "presionado" = visible (ojo abierto)
      btnOjo.setAttribute('aria-label', oculto ? `Mostrar ${etiquetaCaja(clave)}` : `Ocultar ${etiquetaCaja(clave)}`);
      btnOjo.append(crearIcono(oculto ? 'ojo-tachado' : 'ojo'));
      btnOjo.addEventListener('click', (ev) => {
        ev.stopPropagation();
        actualizarCampo(clave, 'visible', oculto ? true : false, true);
      });

      filaCapa.append(btnCapa, btnOjo);
      capas.append(filaCapa);
    }

    if (conPanel) dibujarPanel();
    actualizarBadgePersonalizado();
  }

  function actualizarBadgePersonalizado() {
    badgePersonalizado.hidden = !esAjustePersonalizado(estiloEditando, ajustes);
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
      solicitarRedibujo();
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
      solicitarRedibujo();
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
    const oculto = caja.visible === false;

    const encabezado = document.createElement('div');
    encabezado.className = 'fila editor-plantilla__panel-encabezado';
    const titulo = document.createElement('div');
    titulo.className = 'grupo__titulo';
    titulo.textContent = `Propiedades — ${etiquetaCaja(seleccion)}`;
    const btnOcultar = document.createElement('button');
    btnOcultar.type = 'button';
    btnOcultar.className = 'boton boton--chico boton--fantasma';
    btnOcultar.setAttribute('data-accion', 'editor-toggle-visible');
    btnOcultar.setAttribute('aria-pressed', String(oculto));
    btnOcultar.textContent = oculto ? 'Mostrar' : 'Ocultar';
    btnOcultar.addEventListener('click', () => actualizarCampo(seleccion, 'visible', oculto ? true : false, true));
    encabezado.append(titulo, btnOcultar);
    panel.append(encabezado);

    panel.append(campoRangoNumero('Tamaño de letra', caja.tamano, 16, 160, (v) => actualizarCampo(seleccion, 'tamano', v, true, false)));

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
    selectFuente.addEventListener('change', () => actualizarCampo(seleccion, 'familia', selectFuente.value, true));
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
      btn.addEventListener('click', () => actualizarCampo(seleccion, 'peso', valor, true));
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
      btn.addEventListener('click', () => actualizarCampo(seleccion, 'alineacion', valor, true));
      filaAlineacion.append(btn);
    }
    panel.append(filaAlineacion);

    const btnCentrar = document.createElement('button');
    btnCentrar.type = 'button';
    btnCentrar.className = 'boton boton--chico';
    btnCentrar.setAttribute('data-accion', 'editor-centrar-horizontal');
    btnCentrar.textContent = 'Centrar horizontal';
    btnCentrar.addEventListener('click', () => {
      const x = (ANCHO - caja.w) / 2;
      ajustes[seleccion] = { ...ajustes[seleccion], x };
      dibujarOverlay();
      solicitarRedibujo();
      guardarEnHistorial();
    });
    panel.append(btnCentrar);

    panel.append(campoColor('Color del texto', caja.color, (v, conPanel) => actualizarCampo(seleccion, 'color', v, true, conPanel)));

    const tituloFondo = document.createElement('div');
    tituloFondo.className = 'grupo__titulo';
    tituloFondo.textContent = 'Fondo / etiqueta';
    panel.append(tituloFondo);
    panel.append(campoColor('Color de fondo', caja.fondoColor, (v, conPanel) => actualizarCampo(seleccion, 'fondoColor', v, true, conPanel)));
    panel.append(
      campoRangoNumero('Opacidad del fondo', Math.round((caja.fondoOpacidad ?? 0) * 100), 0, 100, (v) =>
        actualizarCampo(seleccion, 'fondoOpacidad', v / 100, true, false)
      )
    );
    panel.append(
      campoRangoNumero('Redondeo del fondo', caja.fondoRadio ?? 0, 0, 60, (v) => actualizarCampo(seleccion, 'fondoRadio', v, true, false))
    );
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
    input.addEventListener('input', () => onCambio(input.value, false));
    fila.append(input);
    div.append(label, fila);
    return div;
  }

  let debounceGuardado = null;
  function actualizarCampo(clave, campo, valor, regenerarInmediato, conPanel = true) {
    ajustes[clave] = { ...ajustes[clave], [campo]: valor };
    if (regenerarInmediato) solicitarRedibujo();
    dibujarOverlay({ conPanel });
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
    repo.guardarAjustesEstilo(estiloEditando, ajustes);
  }

  btnDeshacer.addEventListener('click', () => {
    if (indiceHistorial === 0) return;
    indiceHistorial -= 1;
    ajustes = estructuraClonada(historial[indiceHistorial]);
    persistir();
    dibujarOverlay();
    solicitarRedibujo();
    actualizarBotonesHistorial();
  });
  btnRehacer.addEventListener('click', () => {
    if (indiceHistorial === historial.length - 1) return;
    indiceHistorial += 1;
    ajustes = estructuraClonada(historial[indiceHistorial]);
    persistir();
    dibujarOverlay();
    solicitarRedibujo();
    actualizarBotonesHistorial();
  });
  // "Acomodar automáticamente" (ronda distribución, CREAR-BRIEF.md): apila los elementos VISIBLES
  // centrados, de abajo hacia arriba (función pura `acomodarAutomatico`, testeada aparte).
  btnAcomodar.addEventListener('click', () => {
    const visibles = CLAVES_TEXTO.filter((clave) => ajustes[clave].visible !== false);
    if (!visibles.length) {
      mostrarToast('No hay elementos visibles para acomodar');
      return;
    }
    const elementos = visibles.map((clave) => ({ clave, w: ajustes[clave].w, h: ajustes[clave].h }));
    const posiciones = acomodarAutomatico(elementos, { ancho: ANCHO, alto: ALTO });
    for (const clave of visibles) {
      ajustes[clave] = { ...ajustes[clave], ...posiciones[clave] };
    }
    dibujarOverlay();
    solicitarRedibujo();
    guardarEnHistorial();
    mostrarToast('Elementos acomodados');
  });
  // "Volver al original de este estilo": restablece SOLO `estiloEditando`, no los otros 2 (cada
  // estilo tiene su propia configuración desde la ronda "ajustes por estilo").
  btnRestablecer.addEventListener('click', async () => {
    const ok = await pedirConfirmacion({
      titulo: 'Volver al original de este estilo',
      mensaje: `Vuelve la posición, tipografía y color de "${ETIQUETA_ESTILO[estiloEditando]}" a los valores de fábrica. No se puede deshacer con "Deshacer" una vez guardado.`,
      textoConfirmar: 'Restablecer',
    });
    if (!ok) return;
    ajustes = estructuraClonada(AJUSTES_POR_DEFECTO_POR_ESTILO[estiloEditando]);
    seleccion = null;
    guardarEnHistorial();
    dibujarOverlay();
    solicitarRedibujo();
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
