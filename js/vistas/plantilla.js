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
//
// Las galerías para ELEGIR estilo/preset se mudaron a la pantalla "Plantillas"
// (js/vistas/plantillas.js, 2026-10-07): acá solo se edita UN estilo. El lienzo arranca bloqueado
// y, al tocar "Editar" o un texto, pasa a pantalla completa hasta tocar "Listo".
import * as repo from '../repositorio.js';
import { dibujarSegunEstilo, resolverCajasTexto, resolverCajasDecorativas, ANCHO, ALTO } from '../componer.js';
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
  PRESETS_FONDO_TEXTO,
  aplicarPresetFondo,
  resolverSeccionNombre,
  TEXTO_BOTON_POR_DEFECTO,
  ELEMENTOS_DECORATIVOS,
  ETIQUETA_DECORATIVO,
  DECORATIVOS_ELASTICOS,
} from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { crearIcono } from '../utils/iconos.js';
import { mostrarToast } from '../utils/toast.js';
import { fotoDeEjemploPorDefecto } from '../utils/foto-ejemplo.js';

const COLORES_RAPIDOS = ['#ffffff', '#242220', '#3a4d39', '#6e5b49', '#f5a623', '#3f5c38'];
const CLAVES_TEXTO = ['nombre', 'precio', 'descripcion'];
const HANDLES = ['nw', 'ne', 'sw', 'se'];
// Guías del lienzo mientras se arrastra (pedido 2026-10-07): las dos del centro se ven SIEMPRE
// durante el arrastre (tenues) y se encienden al engancharse; las de margen solo al engancharse.
// `UMBRAL_SNAP` está en px lógicos (1080 de ancho): 24 ≈ 8px de dedo en un celu, el 12 de antes
// (~4px) casi no se sentía.
const GUIAS_CENTRO = ['centro-x', 'centro-y'];
const GUIAS_MARGEN = ['margen-izquierdo', 'margen-derecho', 'margen-superior', 'margen-inferior'];
const UMBRAL_SNAP = 24;
const PASO_TAMANO_MINI = 4;
const ALINEACIONES = ['left', 'center', 'right'];
const ETIQUETA_ALINEACION = { left: 'izquierda', center: 'centro', right: 'derecha' };
const ICONO_ALINEACION = { left: 'alinear-izquierda', center: 'alinear-centro', right: 'alinear-derecha' };
// "Nombre del negocio" lo dibujan banner-inferior (pie) y editorial (pie); "Texto del botón" solo
// banner-inferior (el único con botón/CTA propio) — polaroid y story-inmersiva no usan ninguno de
// los dos. Los campos se muestran solo mientras se edita un estilo que efectivamente los dibuja.
const ESTILOS_CON_NOMBRE_NEGOCIO = ['banner-inferior', 'editorial'];
const ESTILOS_CON_TEXTO_BOTON = ['banner-inferior'];
// Los que dibujan el nombre de la sección del producto (etiqueta/pill o renglón): en esos, "Capas y
// visibilidad" suma la fila "Sección" para poder sacarla de la imagen.
const ESTILOS_CON_SECCION = ['banner-inferior', 'editorial', 'polaroid', 'story-inmersiva', 'novedad'];

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
  // Sin ningún producto cargado (recién instalada), la vista previa y la galería de presets usan la
  // foto de ejemplo propia del proyecto en vez de quedar sin foto (ronda "orden del diseño",
  // CREAR-BRIEF.md 2026-09-29 — antes esto solo existía en ajustes.js, y acá se veía el ícono de
  // imagen rota / el fondo liso sin foto en cuanto la galería de presets se mudó a esta pantalla).
  const fotoEjemplo = fotoEjemploBlob ? await createImageBitmap(fotoEjemploBlob) : await fotoDeEjemploPorDefecto();
  const descripcionEjemplo = resolverDescripcion(productoEjemplo, { ...general, formatoPrecio });
  const seccionesDisponibles = await repo.listarSecciones();
  // Ejemplo representativo para la vista previa de los 4 presets de composición: sección real del
  // producto de ejemplo (si tiene una) y una posición de tanda de más de 1 para que "N° 0X" (preset
  // Editorial) se vea en el editor tal cual se vería publicando varios juntos.
  // `let`: el ojo de "Sección" (Capas y visibilidad) la apaga/prende y hay que volver a resolverla.
  let seccionNombreEjemplo = resolverSeccionNombre(productoEjemplo, seccionesDisponibles, general);
  const posicionEjemplo = { n: 1, m: 3 };

  await cargarFuentes(); // una sola vez: dibujarSegunEstilo es síncrona, asume fuentes ya listas

  const CLAVES_DECORATIVAS = ELEMENTOS_DECORATIVOS[estiloEditando] ?? [];
  let seleccion = null;
  // Arrastre en curso (mover o redimensionar): muestra las guías y esconde el mini menú para que no
  // tape lo que se está acomodando. `guiasActivas` = las que `aplicarSnap` enganchó en este paso.
  let arrastrando = false;
  let guiasActivas = [];
  // El lienzo arranca BLOQUEADO (pedido 2026-10-07): deslizar el dedo por encima hace scroll de la
  // página y no mueve nada. Se edita recién después de tocar "Editar" o uno de los textos: ahí el
  // lienzo pasa a pantalla completa (sin scroll alrededor) hasta tocar "Listo".
  let editando = false;
  let miniColorAbierto = false;
  // Declarados acá (y no más abajo, junto a `solicitarRedibujo`) para que la llamada inicial de
  // más abajo no choque con la zona muerta temporal de `let` (TDZ): las funciones declaradas con
  // `function` se hoistean enteras, pero un `let` no se puede leer antes de su propia línea.
  let rafPendiente = false;
  let contadorDibujos = 0;

  const historial = [estructuraClonada(ajustes)];
  let indiceHistorial = 0;

  const wrap = document.createElement('div');
  wrap.className = 'pila editor-plantilla';

  // --- Barra superior propia (editar_plantilla_natural: sin header de app — mismo criterio que
  // Editar Producto, `headerOculto` en main.js): "← Volver a Ajustes" | "Plantilla" (serif,
  // centrado) | badge de estado ("Personalizado"/"Por defecto"). 3 columnas iguales por grilla
  // (no `justify-content`) para que el título quede EXACTAMENTE centrado sin importar cuánto
  // midan los otros 2 elementos. ---
  const barraSuperior = document.createElement('div');
  barraSuperior.className = 'barra-volver barra-volver--plantilla';
  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'enlace-volver';
  btnVolver.setAttribute('data-accion', 'ir-ajustes');
  const etiquetaVolver = document.createElement('span');
  etiquetaVolver.textContent = 'Volver a Ajustes';
  btnVolver.append(crearIcono('volver'), etiquetaVolver);
  btnVolver.addEventListener('click', () => navegar?.('#/ajustes'));
  const tituloBarra = document.createElement('h1');
  tituloBarra.className = 'barra-volver__titulo';
  tituloBarra.textContent = 'Plantilla';
  // Badge de estado: SIEMPRE visible (antes solo aparecía tras personalizar) — "Por defecto" o
  // "Personalizado", el texto lo fija `actualizarBadgePersonalizado()`.
  const badgeEstado = document.createElement('span');
  badgeEstado.className = 'editor-plantilla__badge';
  barraSuperior.append(btnVolver, tituloBarra, badgeEstado);

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
  // "Modo activo" (editar_plantilla_natural): rótulo tenue junto al selector — el estado
  // "Personalizado"/"Por defecto" ahora vive en la barra superior (`badgeEstado`), no acá.
  const etiquetaModoActivo = document.createElement('span');
  etiquetaModoActivo.className = 'texto-tenue';
  etiquetaModoActivo.textContent = 'Modo activo';
  filaLabelEstilo.append(labelEstilo, etiquetaModoActivo);
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
  // La galería para ELEGIR plantilla vive en su propia pantalla (2026-10-07).
  const btnPlantillas = document.createElement('button');
  btnPlantillas.type = 'button';
  btnPlantillas.className = 'boton boton--ancho';
  btnPlantillas.setAttribute('data-accion', 'ir-plantillas');
  btnPlantillas.append(crearIcono('grilla'), document.createTextNode('Ver todas las plantillas'));
  btnPlantillas.addEventListener('click', () => navegar('#/plantillas'));
  selectorEstilo.append(filaLabelEstilo, selectEstilo, btnPlantillas);

  // --- Subida de fondo propio ---
  // Se ve SIEMPRE (editar_plantilla_natural: la caja punteada está ahí sin importar qué estilo se
  // esté editando) — antes se ocultaba fuera de "Mi plantilla", lo que la escondía justo cuando
  // más sentido tenía descubrirla. Subir un fondo estando en OTRO estilo cambia el estilo general
  // a "Mi plantilla" (es lo único que usa ese fondo) y avisa por toast antes de pasar a editarlo.
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
  btnSubir.className = 'boton boton--subir-fondo';
  btnSubir.setAttribute('data-accion', 'subir-plantilla');
  btnSubir.append(crearIcono('subir'), document.createTextNode('Subir mi fondo (PNG 1080×1920)'));
  btnSubir.addEventListener('click', () => inputPlantilla.click());
  let plantillaImagenActual = await createImageBitmap(await repo.obtenerImagenPlantillaBlob());
  inputPlantilla.addEventListener('change', async (ev) => {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    await repo.guardarImagenPlantilla(archivo);
    plantillaImagenActual = await createImageBitmap(archivo);
    if (estiloEditando !== 'mi-plantilla') {
      await repo.guardarEstiloGeneral('mi-plantilla');
      general.estiloGeneral = 'mi-plantilla';
      mostrarToast('Fondo actualizado — ahora se usa "Mi plantilla"');
      navegar('#/plantilla?estilo=mi-plantilla');
      return;
    }
    mostrarToast('Fondo actualizado');
    solicitarRedibujo();
  });
  grupoSubida.append(btnSubir, inputPlantilla);

  // --- Datos del negocio (ronda 2026-09-29): "Nombre del negocio" (vacío = no se dibuja) y "Texto
  // del botón" del preset "Banner inferior" — ajustes GENERALES (uno solo para toda la app, no por
  // estilo), solo visibles mientras se edita un preset que los usa. ---
  const grupoNegocio = document.createElement('div');
  grupoNegocio.className = 'grupo';
  const tituloNegocio = document.createElement('div');
  tituloNegocio.className = 'grupo__titulo';
  tituloNegocio.textContent = 'Datos del negocio';
  grupoNegocio.append(tituloNegocio);

  const campoNombreNegocio = document.createElement('div');
  campoNombreNegocio.className = 'campo';
  const labelNombreNegocio = document.createElement('label');
  labelNombreNegocio.className = 'campo__etiqueta';
  labelNombreNegocio.htmlFor = 'campo-nombre-negocio';
  labelNombreNegocio.textContent = 'Nombre del negocio (opcional)';
  const inputNombreNegocio = document.createElement('input');
  inputNombreNegocio.type = 'text';
  inputNombreNegocio.id = 'campo-nombre-negocio';
  inputNombreNegocio.maxLength = 60;
  inputNombreNegocio.placeholder = 'Vacío: no se dibuja';
  inputNombreNegocio.value = general.nombreNegocio || '';
  inputNombreNegocio.setAttribute('data-accion', 'campo-nombre-negocio');
  campoNombreNegocio.append(labelNombreNegocio, inputNombreNegocio);
  campoNombreNegocio.hidden = !ESTILOS_CON_NOMBRE_NEGOCIO.includes(estiloEditando);

  const campoTextoBoton = document.createElement('div');
  campoTextoBoton.className = 'campo';
  const labelTextoBoton = document.createElement('label');
  labelTextoBoton.className = 'campo__etiqueta';
  labelTextoBoton.htmlFor = 'campo-texto-boton';
  labelTextoBoton.textContent = 'Texto del botón/llamado';
  const inputTextoBoton = document.createElement('input');
  inputTextoBoton.type = 'text';
  inputTextoBoton.id = 'campo-texto-boton';
  inputTextoBoton.maxLength = 40;
  inputTextoBoton.value = general.textoBoton || TEXTO_BOTON_POR_DEFECTO;
  inputTextoBoton.setAttribute('data-accion', 'campo-texto-boton');
  campoTextoBoton.append(labelTextoBoton, inputTextoBoton);
  campoTextoBoton.hidden = !ESTILOS_CON_TEXTO_BOTON.includes(estiloEditando);

  grupoNegocio.append(campoNombreNegocio, campoTextoBoton);
  grupoNegocio.hidden = campoNombreNegocio.hidden && campoTextoBoton.hidden;

  let debounceNegocio = null;
  inputNombreNegocio.addEventListener('input', () => {
    general.nombreNegocio = inputNombreNegocio.value;
    solicitarRedibujo();
    clearTimeout(debounceNegocio);
    debounceNegocio = setTimeout(() => repo.guardarNombreNegocio(inputNombreNegocio.value), 350);
  });
  let debounceBoton = null;
  inputTextoBoton.addEventListener('input', () => {
    general.textoBoton = inputTextoBoton.value;
    solicitarRedibujo();
    clearTimeout(debounceBoton);
    debounceBoton = setTimeout(() => repo.guardarTextoBoton(inputTextoBoton.value), 350);
  });

  // --- Cabecera de la vista previa: "Previsualización de estado (9:16)" + "● Guías interactivas"
  // EN LA MISMA LÍNEA (editar_plantilla_natural) — `flex-wrap: nowrap` a propósito, con el punto
  // de color que trae el mock delante del texto. ---
  const cabeceraPrevia = document.createElement('div');
  cabeceraPrevia.className = 'panel__cabecera editor-plantilla__cabecera-previa';
  const tituloPrevia = document.createElement('span');
  tituloPrevia.className = 'grupo__titulo';
  tituloPrevia.textContent = 'Previsualización de estado (9:16)';
  const btnModo = document.createElement('button');
  btnModo.type = 'button';
  btnModo.className = 'boton boton--chico editor-plantilla__modo';
  btnModo.setAttribute('data-accion', 'editar-lienzo');
  btnModo.addEventListener('click', () => fijarEdicion(!editando));
  // Deshacer/rehacer a mano mientras el lienzo está a pantalla completa (la barra de siempre queda
  // tapada): mismos handlers que los de la tarjeta de controles.
  const historialPantalla = document.createElement('div');
  historialPantalla.className = 'editor-plantilla__historial-pantalla';
  const btnDeshacerPantalla = document.createElement('button');
  btnDeshacerPantalla.type = 'button';
  btnDeshacerPantalla.className = 'boton boton--chico';
  btnDeshacerPantalla.setAttribute('data-accion', 'deshacer-pantalla');
  btnDeshacerPantalla.setAttribute('aria-label', 'Deshacer');
  btnDeshacerPantalla.append(crearIcono('deshacer'));
  const btnRehacerPantalla = document.createElement('button');
  btnRehacerPantalla.type = 'button';
  btnRehacerPantalla.className = 'boton boton--chico';
  btnRehacerPantalla.setAttribute('data-accion', 'rehacer-pantalla');
  btnRehacerPantalla.setAttribute('aria-label', 'Rehacer');
  btnRehacerPantalla.append(crearIcono('rehacer'));
  historialPantalla.append(btnDeshacerPantalla, btnRehacerPantalla);
  cabeceraPrevia.append(tituloPrevia, historialPantalla, btnModo);
  const zonaLienzo = document.createElement('div');
  zonaLienzo.className = 'editor-plantilla__zona';
  zonaLienzo.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && editando) fijarEdicion(false);
  });

  // Estado del lienzo con palabras, debajo de la vista previa (y un segundo "Listo" abajo, al
  // alcance del pulgar con el lienzo a pantalla completa).
  const filaModo = document.createElement('div');
  filaModo.className = 'editor-plantilla__estado-modo';
  const textoModo = document.createElement('p');
  textoModo.className = 'texto-tenue';
  textoModo.setAttribute('role', 'status');
  const btnListo = document.createElement('button');
  btnListo.type = 'button';
  btnListo.className = 'boton boton--chico boton--primario';
  btnListo.setAttribute('data-accion', 'terminar-edicion-lienzo');
  btnListo.append(crearIcono('check'), document.createTextNode('Listo'));
  btnListo.addEventListener('click', () => fijarEdicion(false));
  filaModo.append(textoModo, btnListo);

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
  panel.className = 'panel editor-plantilla__panel';
  panel.hidden = true;

  // --- Deshacer / rehacer / Acomodar / Volver al original de este estilo ---
  // Fila de 4 (ícono arriba, etiqueta chica abajo — editar_plantilla_natural), dentro de la
  // tarjeta de controles de arriba. Ya NO es `position: sticky`: al vivir dentro de una tarjeta
  // acotada (`.panel`, ver `panelControles` más abajo) solo podía seguir a la vista mientras esa
  // tarjeta siguiera en pantalla (su "contenedor de bloque" para el sticky) — más allá se
  // despegaba igual (mismo mecanismo que BUGS.md #50 diagnosticó), así que quedaba a medias. El
  // mock tampoco tiene una barra flotante: es parte fija de la tarjeta superior.
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
  btnAcomodar.append(crearIcono('acomodar'), document.createTextNode('Acomodar'));
  const btnRestablecer = document.createElement('button');
  btnRestablecer.type = 'button';
  btnRestablecer.className = 'boton boton--chico boton--fantasma';
  btnRestablecer.setAttribute('data-accion', 'restablecer-plantilla');
  btnRestablecer.append(crearIcono('restablecer'), document.createTextNode('Restablecer'));
  filaHistorial.append(btnDeshacer, btnRehacer, btnAcomodar, btnRestablecer);

  // Tarjeta "CONTROLES SUPERIORES" (editar_plantilla_natural): selector de estilo + "Subir mi
  // fondo" + la barra de deshacer/rehacer/acomodar/restablecer, las 3 juntas dentro de UNA tarjeta
  // `.panel`, como el mock. BUGS.md #48/#50 documentaban que este mismo envoltorio rompía el
  // arrastre del lienzo en 412×915: la causa real no era la tarjeta en sí, sino que nada
  // garantizaba que el lienzo (más abajo, después de sumar esta tarjeta + la galería de presets)
  // quedara visible sin scroll — un test que lee `boundingBox()`/arrastra con coordenadas de
  // pantalla se rompe si el elemento cae detrás de la nav inferior fija. La solución correcta es
  // que ESOS tests hagan scroll hasta el lienzo antes de leer coordenadas (ver
  // `asegurarLienzoVisible` en editor.spec.js/tactil.spec.js/ajustes.spec.js), no esconder la
  // tarjeta del diseño.
  const panelControles = document.createElement('div');
  panelControles.className = 'panel pila editor-plantilla__panel-controles';
  panelControles.append(selectorEstilo, grupoSubida, grupoNegocio, filaHistorial);

  // Orden final, de arriba a abajo: barra superior propia → tarjeta de controles → cabecera de la
  // vista previa → lienzo → Capas y visibilidad → panel de propiedades. Las galerías de estilos y
  // presets se mudaron a la pantalla "Plantillas" (js/vistas/plantillas.js, 2026-10-07).
  // El lienzo con su cabecera y su fila de estado van juntos en `zonaLienzo`: al editar, esa zona
  // pasa a ocupar TODA la pantalla (`--pantalla`, pedido 2026-10-07) — sin scroll debajo del dedo,
  // así no se mueve un texto sin querer — y "Listo" la devuelve a su lugar en la página.
  zonaLienzo.append(cabeceraPrevia, previaContenedor, filaModo);
  wrap.append(barraSuperior, panelControles, zonaLienzo, capas, panel);
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
    if (estiloEditando === 'mi-plantilla') return ['foto', ...CLAVES_TEXTO];
    // "Novedad"/"Ficha natural": también sus piezas fijas (pill, divisores, WhatsApp, insignia).
    return [...CLAVES_TEXTO, ...CLAVES_DECORATIVAS];
  }

  // Solo los elementos VISIBLES son "clickeables" directo sobre el lienzo (ver dibujarOverlay: un
  // elemento oculto no dibuja caja en el overlay, igual que el mock no lo dibuja en la
  // previsualización) — para reactivarlo hay que ir a "Capas y visibilidad".
  function cajasHitTest() {
    const visuales = cajasVisuales();
    return clavesVisiblesParaEstilo()
      .map((clave) => ({ clave, ...visuales[clave] }))
      .filter((caja) => caja.visible !== false);
  }

  function datosLienzo() {
    return {
      estilo: estiloEditando,
      plantillaImagen: plantillaImagenActual,
      fotoImagen: fotoEjemplo,
      producto: productoEjemplo,
      ajustes,
      formatoPrecio,
      descripcion: descripcionEjemplo,
      encuadreFoto: general.encuadreFoto,
      general,
      seccionNombre: seccionNombreEjemplo,
      posicion: posicionEjemplo,
    };
  }

  // Dónde se DIBUJA cada caja: igual a `ajustes`, salvo que la descripción de ejemplo no entre en
  // su caja — ahí crece y corre a nombre/precio (`resolverCajasTexto`, componer.js). El overlay y el
  // hit-test usan estas, para que el recuadro quede sobre el texto que se ve; arrastrar/redimensionar
  // siguen operando sobre `ajustes` (lo que se guarda), el corrimiento se recalcula en cada dibujo.
  function cajasVisuales() {
    const cajas = resolverCajasTexto(ctxPrevia, datosLienzo());
    const visuales = { ...ajustes, nombre: cajas.nombre, precio: cajas.precio, descripcion: cajas.descripcion };
    const decorativas = resolverCajasDecorativas(datosLienzo(), cajas.extra);
    for (const clave of CLAVES_DECORATIVAS) visuales[clave] = decorativas[clave].caja;
    return visuales;
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
    dibujarSegunEstilo(ctxPrevia, datosLienzo());
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
  function fijarEdicion(valor, clave) {
    editando = valor;
    if (clave !== undefined) {
      if (clave !== seleccion) miniColorAbierto = false;
      seleccion = clave;
    }
    dibujarOverlay();
  }

  function pintarModo() {
    previaContenedor.classList.toggle('editor-plantilla__lienzo--editando', editando);
    zonaLienzo.classList.toggle('editor-plantilla__zona--pantalla', editando);
    btnModo.textContent = '';
    btnModo.append(crearIcono(editando ? 'check' : 'lapiz'), document.createTextNode(editando ? 'Listo' : 'Editar'));
    btnModo.classList.toggle('boton--primario', !editando);
    btnModo.setAttribute('aria-pressed', String(editando));
    textoModo.textContent = editando
      ? 'Arrastrá cada parte para moverla; las esquinas la agrandan o achican. En los textos, tocá uno para cambiarle color o letra.'
      : 'Bloqueado: podés deslizar sin mover nada. Tocá "Editar" o una parte de la imagen para acomodarla.';
    btnListo.hidden = !editando;
  }

  function dibujarOverlay({ conPanel = true } = {}) {
    overlay.textContent = '';
    pintarModo();
    const claves = clavesVisiblesParaEstilo();
    const visuales = cajasVisuales();

    capas.textContent = '';
    const cabeceraCapas = document.createElement('div');
    cabeceraCapas.className = 'panel__cabecera';
    const tituloCapas = document.createElement('span');
    tituloCapas.className = 'grupo__titulo';
    tituloCapas.textContent = 'Capas y visibilidad';
    const pistaCapas = document.createElement('span');
    pistaCapas.className = 'texto-tenue';
    pistaCapas.textContent = 'Tocar para alternar';
    cabeceraCapas.append(tituloCapas, pistaCapas);
    // Una sola tarjeta blanca con las filas separadas por líneas finas (editar_plantilla_natural) —
    // antes cada fila era su propia cajita con borde propio.
    const listaCapas = document.createElement('div');
    listaCapas.className = 'editor-plantilla__lista-capas';
    capas.append(cabeceraCapas, listaCapas);

    for (const clave of claves) {
      const caja = ajustes[clave];
      const oculto = caja.visible === false;
      // Un elemento OCULTO no se dibuja en el lienzo (ni la caja punteada ni nada — igual que el
      // mock, que directamente no lo muestra): la única forma de volver a tocarlo es reactivarlo
      // desde "Capas y visibilidad" más abajo, cuyo `<button data-accion="capa-<clave>">` ya
      // selecciona y muestra el panel de propiedades sin depender de una caja en el overlay.
      if (!oculto) {
        const div = document.createElement('div');
        div.className = 'editor-plantilla__caja' + (seleccion === clave ? ' editor-plantilla__caja--activa' : '');
        div.setAttribute('data-elemento', clave); // para tests: clic directo sobre el elemento en el lienzo
        posicionarEnPx(div, visuales[clave]);
        if (editando) div.addEventListener('pointerdown', (ev) => alPointerDownCaja(ev, clave));
        else div.addEventListener('click', () => fijarEdicion(true, clave)); // un toque (no un deslizamiento) entra a editar
        if (editando && seleccion === clave) {
          for (const manija of HANDLES) {
            const h = document.createElement('div');
            h.className = `editor-plantilla__manija editor-plantilla__manija--${manija}`;
            h.addEventListener('pointerdown', (ev) => alPointerDownManija(ev, clave, manija));
            div.append(h);
          }
        }
        overlay.append(div);
      }

      // Capas: lista VERTICAL, una fila por capa, la seleccionada resaltada (ronda "capas
      // verticales"). Ronda "reskin plantilla": cada fila ahora es icono-en-cuadrito + nombre en
      // negrita + subtexto de estado real ("Oculto en este estilo" / dónde se ve) + ojo sin caja a
      // la derecha (editar_plantilla_natural) — antes era un botón de texto plano con "(oculto)"
      // pegado al nombre.
      const filaCapa = document.createElement('div');
      filaCapa.className = 'editor-plantilla__fila-capa' + (seleccion === clave ? ' editor-plantilla__fila-capa--activa' : '');

      const btnCapa = document.createElement('button');
      btnCapa.type = 'button';
      btnCapa.className = 'editor-plantilla__fila-capa__nombre';
      btnCapa.setAttribute('data-accion', `capa-${clave}`);

      const iconoCapaTile = document.createElement('span');
      iconoCapaTile.className = 'editor-plantilla__capa-icono' + (!oculto ? ' editor-plantilla__capa-icono--visible' : '');
      iconoCapaTile.append(crearIcono(iconoCapa(clave)));

      const textosCapa = document.createElement('span');
      textosCapa.className = 'editor-plantilla__capa-textos';
      const nombreCapaEl = document.createElement('span');
      nombreCapaEl.className = 'editor-plantilla__capa-nombre' + (!oculto ? ' editor-plantilla__capa-nombre--visible' : '');
      nombreCapaEl.textContent = etiquetaCaja(clave);
      const estadoCapaEl = document.createElement('span');
      estadoCapaEl.className = 'editor-plantilla__capa-estado' + (!oculto ? ' editor-plantilla__capa-estado--visible' : '');
      estadoCapaEl.textContent = estadoCapa(clave, oculto);
      textosCapa.append(nombreCapaEl, estadoCapaEl);

      btnCapa.append(iconoCapaTile, textosCapa);
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
      listaCapas.append(filaCapa);
    }
    if (ESTILOS_CON_SECCION.includes(estiloEditando)) listaCapas.append(filaCapaSeccion());

    if (arrastrando) dibujarGuias();
    else if (editando && CLAVES_TEXTO.includes(seleccion) && ajustes[seleccion].visible !== false) {
      overlay.append(miniMenu(seleccion, visuales[seleccion]));
    }

    if (conPanel) dibujarPanel();
    actualizarBadgePersonalizado();
  }

  // Fila "Sección" de Capas: no es una caja que se mueva (su lugar lo fija cada diseño), solo se
  // muestra u oculta. Es el mismo ajuste que "Mostrar la sección en la imagen" de la hoja de
  // revisión (`general.mostrarSeccionEnImagen`): vale para todos los estilos y se guarda al toque.
  function filaCapaSeccion() {
    const oculto = general.mostrarSeccionEnImagen === false;
    const fila = document.createElement('div');
    fila.className = 'editor-plantilla__fila-capa';

    const btnNombre = document.createElement('button');
    btnNombre.type = 'button';
    btnNombre.className = 'editor-plantilla__fila-capa__nombre';
    btnNombre.setAttribute('data-accion', 'capa-seccion');
    const tile = document.createElement('span');
    tile.className = 'editor-plantilla__capa-icono' + (!oculto ? ' editor-plantilla__capa-icono--visible' : '');
    tile.append(crearIcono('etiqueta'));
    const textos = document.createElement('span');
    textos.className = 'editor-plantilla__capa-textos';
    const nombre = document.createElement('span');
    nombre.className = 'editor-plantilla__capa-nombre' + (!oculto ? ' editor-plantilla__capa-nombre--visible' : '');
    nombre.textContent = 'Sección';
    const estado = document.createElement('span');
    estado.className = 'editor-plantilla__capa-estado' + (!oculto ? ' editor-plantilla__capa-estado--visible' : '');
    estado.textContent = oculto ? 'Oculta en todos los estilos' : 'Visible en todos los estilos';
    textos.append(nombre, estado);
    btnNombre.append(tile, textos);

    const btnOjo = document.createElement('button');
    btnOjo.type = 'button';
    btnOjo.className = 'boton boton--chico boton--fantasma editor-plantilla__ojo';
    btnOjo.setAttribute('data-accion', 'capa-ojo-seccion');
    btnOjo.setAttribute('aria-pressed', String(!oculto));
    btnOjo.setAttribute('aria-label', oculto ? 'Mostrar Sección' : 'Ocultar Sección');
    btnOjo.append(crearIcono(oculto ? 'ojo-tachado' : 'ojo'));

    const alternar = async () => {
      general.mostrarSeccionEnImagen = oculto; // estaba oculta → se muestra, y al revés
      seccionNombreEjemplo = resolverSeccionNombre(productoEjemplo, seccionesDisponibles, general);
      pintarLienzo();
      dibujarOverlay({ conPanel: false });
      try {
        await repo.guardarMostrarSeccionEnImagen(general.mostrarSeccionEnImagen);
      } catch {
        mostrarToast('No se pudo guardar si se muestra la sección.');
      }
    };
    btnNombre.addEventListener('click', alternar);
    btnOjo.addEventListener('click', alternar);

    fila.append(btnNombre, btnOjo);
    return fila;
  }

  // Guías del arrastre: línea vertical/horizontal del centro del lienzo (tenues mientras se mueve,
  // resaltadas cuando el elemento quedó enganchado) + las de margen al engancharse, y un rótulo que
  // lo dice con palabras ("Centrado") — no depende solo del color.
  function dibujarGuias() {
    for (const guia of [...GUIAS_CENTRO, ...GUIAS_MARGEN]) {
      const activa = guiasActivas.includes(guia);
      if (!activa && !GUIAS_CENTRO.includes(guia)) continue;
      const linea = document.createElement('div');
      linea.className = `editor-plantilla__guia editor-plantilla__guia--${guia}` + (activa ? ' editor-plantilla__guia--activa' : '');
      linea.setAttribute('data-guia', guia);
      linea.setAttribute('data-activa', String(activa));
      overlay.append(linea);
    }
    const enX = guiasActivas.includes('centro-x');
    const enY = guiasActivas.includes('centro-y');
    if (enX || enY) {
      const rotulo = document.createElement('div');
      rotulo.className = 'editor-plantilla__guia-rotulo';
      rotulo.setAttribute('role', 'status');
      rotulo.textContent = enX && enY ? 'Centrado' : enX ? 'Centro horizontal' : 'Centro vertical';
      overlay.append(rotulo);
    }
  }

  // Mini menú flotante junto al elemento seleccionado (pedido 2026-10-07): lo de todos los días
  // (tamaño, alineación, color, tipografía) sin bajar hasta el panel de propiedades, que sigue
  // estando abajo con todo lo demás. Va arriba de la caja si hay lugar, si no abajo.
  function miniMenu(clave, cajaVisual) {
    const caja = ajustes[clave];
    const menu = document.createElement('div');
    menu.className = 'editor-plantilla__mini';
    menu.setAttribute('role', 'toolbar');
    menu.setAttribute('aria-label', `Ajustes rápidos de ${etiquetaCaja(clave)}`);
    // Un toque en el menú no es un toque en el lienzo: no deselecciona ni arranca un arrastre.
    menu.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    const fila = document.createElement('div');
    fila.className = 'editor-plantilla__mini-fila';

    const botonMini = (accion, etiqueta, contenido) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-plantilla__mini-boton';
      btn.setAttribute('data-accion', accion);
      btn.setAttribute('aria-label', etiqueta);
      btn.title = etiqueta;
      btn.append(contenido);
      return btn;
    };
    const muestraColor = (color) => {
      const muestra = document.createElement('span');
      muestra.className = 'editor-plantilla__mini-muestra';
      muestra.style.background = color;
      return muestra;
    };

    const tamano = caja.tamano || 48;
    const cambiarTamano = (delta) => actualizarCampo(clave, 'tamano', Math.max(16, Math.min(160, tamano + delta)), true);
    const btnMenos = botonMini('mini-tamano-menos', 'Achicar la letra', document.createTextNode('A−'));
    btnMenos.classList.add('editor-plantilla__mini-boton--chico');
    btnMenos.disabled = tamano <= 16;
    btnMenos.addEventListener('click', () => cambiarTamano(-PASO_TAMANO_MINI));
    const btnMas = botonMini('mini-tamano-mas', 'Agrandar la letra', document.createTextNode('A+'));
    btnMas.disabled = tamano >= 160;
    btnMas.addEventListener('click', () => cambiarTamano(PASO_TAMANO_MINI));

    const alineacion = ALINEACIONES.includes(caja.alineacion) ? caja.alineacion : 'center';
    const siguiente = ALINEACIONES[(ALINEACIONES.indexOf(alineacion) + 1) % ALINEACIONES.length];
    const btnAlinear = botonMini(
      'mini-alineacion',
      `Alineación: ${ETIQUETA_ALINEACION[alineacion]}. Tocar para pasar a ${ETIQUETA_ALINEACION[siguiente]}`,
      crearIcono(ICONO_ALINEACION[alineacion])
    );
    btnAlinear.setAttribute('data-valor', alineacion);
    btnAlinear.addEventListener('click', () => actualizarCampo(clave, 'alineacion', siguiente, true));

    const btnColor = botonMini('mini-color', 'Color del texto', muestraColor(caja.color || '#ffffff'));
    btnColor.setAttribute('aria-expanded', String(miniColorAbierto));
    btnColor.addEventListener('click', () => {
      miniColorAbierto = !miniColorAbierto;
      dibujarOverlay({ conPanel: false });
    });

    const selectFuente = document.createElement('select');
    selectFuente.className = 'editor-plantilla__mini-fuente';
    selectFuente.setAttribute('data-accion', 'mini-fuente');
    selectFuente.setAttribute('aria-label', 'Tipografía');
    for (const fuente of FUENTES_DISPONIBLES) {
      const opcion = document.createElement('option');
      opcion.value = fuente;
      opcion.textContent = ETIQUETA_FUENTE[fuente];
      if (fuente === caja.familia) opcion.selected = true;
      selectFuente.append(opcion);
    }
    selectFuente.addEventListener('change', () => actualizarCampo(clave, 'familia', selectFuente.value, true));

    fila.append(btnMenos, btnMas, btnAlinear, btnColor, selectFuente);
    menu.append(fila);

    if (miniColorAbierto) {
      const filaColores = document.createElement('div');
      filaColores.className = 'editor-plantilla__mini-fila editor-plantilla__mini-colores';
      for (const rapido of COLORES_RAPIDOS) {
        const swatch = botonMini(`mini-color-${rapido.slice(1)}`, `Color ${rapido}`, muestraColor(rapido));
        swatch.setAttribute('aria-pressed', String((caja.color || '').toLowerCase() === rapido));
        swatch.addEventListener('click', () => {
          miniColorAbierto = false;
          actualizarCampo(clave, 'color', rapido, true);
        });
        filaColores.append(swatch);
      }
      menu.append(filaColores);
    }

    const altoLienzo = overlay.getBoundingClientRect().height || 1;
    const altoMenu = miniColorAbierto ? 116 : 60;
    const separacion = 14; // deja libres las manijas de las esquinas
    const arribaPx = (cajaVisual.y / ALTO) * altoLienzo;
    const abajoPx = ((cajaVisual.y + cajaVisual.h) / ALTO) * altoLienzo;
    const top =
      arribaPx >= altoMenu + separacion
        ? arribaPx - altoMenu - separacion
        : Math.max(0, Math.min(abajoPx + separacion, altoLienzo - altoMenu));
    menu.style.top = `${Math.round(top)}px`;
    return menu;
  }

  // Badge de la barra superior: SIEMPRE visible, con 2 estados ("Por defecto"/"Personalizado") —
  // antes aparecía/desaparecía con `hidden` (editar_plantilla_natural lo muestra siempre).
  function actualizarBadgePersonalizado() {
    const personalizado = esAjustePersonalizado(estiloEditando, ajustes);
    badgeEstado.textContent = personalizado ? 'Personalizado' : 'Por defecto';
    badgeEstado.classList.toggle('editor-plantilla__badge--por-defecto', !personalizado);
  }

  function etiquetaCaja(clave) {
    return { foto: 'Foto', nombre: 'Nombre', precio: 'Precio', descripcion: 'Descripción', ...ETIQUETA_DECORATIVO }[clave];
  }

  // Ícono del cuadradito de cada fila de Capas (editar_plantilla_natural: "T" para nombre, billete
  // para precio, párrafo para descripción, cámara para la foto de fondo de "Mi plantilla").
  function iconoCapa(clave) {
    return { foto: 'camara', nombre: 'texto', precio: 'moneda', descripcion: 'parrafo' }[clave] ?? 'etiqueta';
  }

  // Subtexto de estado REAL de cada fila (no un genérico "Activo/Inactivo"): oculto dice que está
  // oculto EN ESTE ESTILO (cada estilo tiene su propia visibilidad); visible dice dónde se ve.
  function estadoCapa(clave, oculto) {
    if (oculto) return 'Oculto en este estilo';
    if (CLAVES_DECORATIVAS.includes(clave)) return 'Parte del diseño';
    return { foto: 'Fondo de la plantilla', nombre: 'Visible sobre la foto', precio: 'Visible sobre la foto', descripcion: 'Visible en el pie' }[
      clave
    ];
  }

  function posicionarEnPx(div, caja) {
    div.style.left = `${(caja.x / ANCHO) * 100}%`;
    div.style.top = `${(caja.y / ALTO) * 100}%`;
    div.style.width = `${(caja.w / ANCHO) * 100}%`;
    div.style.height = `${(caja.h / ALTO) * 100}%`;
  }

  overlay.addEventListener('pointerdown', (ev) => {
    if (!editando) return; // bloqueado: el toque en el fondo es scroll, no selección
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
    if (clave !== seleccion) miniColorAbierto = false;
    seleccion = clave;
    dibujarOverlay();
  }

  function terminarArrastre() {
    arrastrando = false;
    guiasActivas = [];
    guardarEnHistorial();
    dibujarOverlay();
  }

  function alPointerDownCaja(ev, clave) {
    ev.stopPropagation();
    ev.preventDefault();
    if (clave !== seleccion) miniColorAbierto = false;
    seleccion = clave;
    const inicio = puntoDesdeEvento(ev);
    const cajaInicial = { ...ajustes[clave] };
    const alMover = (evMove) => {
      const actual = puntoDesdeEvento(evMove);
      const nueva = moverCaja(cajaInicial, actual.x - inicio.x, actual.y - inicio.y, { w: ANCHO, h: ALTO });
      const { caja: conSnap, guias } = aplicarSnap(nueva, { w: ANCHO, h: ALTO }, UMBRAL_SNAP);
      // Aviso táctil cortito al engancharse en un centro (donde el dispositivo lo soporte).
      if (guias.some((g) => GUIAS_CENTRO.includes(g) && !guiasActivas.includes(g))) navigator.vibrate?.(8);
      arrastrando = true;
      guiasActivas = guias;
      ajustes[clave] = { ...ajustes[clave], x: conSnap.x, y: conSnap.y };
      dibujarOverlay({ conPanel: false });
      solicitarRedibujo();
    };
    const alSoltar = () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      window.removeEventListener('pointercancel', alSoltar);
      terminarArrastre();
    };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alSoltar);
    dibujarOverlay();
  }

  function alPointerDownManija(ev, clave, manija) {
    ev.stopPropagation();
    ev.preventDefault();
    const inicio = puntoDesdeEvento(ev);
    const cajaInicial = { ...ajustes[clave] };
    const alMover = (evMove) => {
      const actual = puntoDesdeEvento(evMove);
      let nueva = redimensionarCaja(cajaInicial, manija, actual.x - inicio.x, actual.y - inicio.y, { w: ANCHO, h: ALTO });
      // Las piezas del diseño que no son divisores escalan parejas: el alto sigue al ancho, con el
      // borde opuesto a la manija quieto.
      if (CLAVES_DECORATIVAS.includes(clave) && !DECORATIVOS_ELASTICOS.includes(clave)) {
        const h = Math.round((nueva.w * cajaInicial.h) / cajaInicial.w);
        nueva = { ...nueva, h, y: manija.startsWith('n') ? cajaInicial.y + cajaInicial.h - h : cajaInicial.y };
      } else if (DECORATIVOS_ELASTICOS.includes(clave)) {
        nueva = { ...nueva, h: cajaInicial.h, y: cajaInicial.y };
      }
      arrastrando = true;
      ajustes[clave] = { ...ajustes[clave], ...nueva };
      dibujarOverlay({ conPanel: false });
      solicitarRedibujo();
    };
    const alSoltar = () => {
      window.removeEventListener('pointermove', alMover);
      window.removeEventListener('pointerup', alSoltar);
      window.removeEventListener('pointercancel', alSoltar);
      terminarArrastre();
    };
    window.addEventListener('pointermove', alMover);
    window.addEventListener('pointerup', alSoltar);
    window.addEventListener('pointercancel', alSoltar);
  }

  // Panel de una pieza del diseño (pill, divisor, WhatsApp, insignia): no tiene tipografía ni
  // color propios — se muestra/oculta, se le cambia el tamaño y se centra. Mover y redimensionar
  // con el dedo se hace sobre el lienzo, como con los textos.
  function dibujarPanelDecorativo(clave, caja, oculto) {
    const fabrica = AJUSTES_POR_DEFECTO_POR_ESTILO[estiloEditando][clave];
    const encabezado = document.createElement('div');
    encabezado.className = 'fila editor-plantilla__panel-encabezado';
    const titulo = document.createElement('div');
    titulo.className = 'grupo__titulo';
    titulo.textContent = `Propiedades — ${etiquetaCaja(clave)}`;
    const btnOcultar = document.createElement('button');
    btnOcultar.type = 'button';
    btnOcultar.className = 'boton boton--chico boton--fantasma';
    btnOcultar.setAttribute('data-accion', 'editor-toggle-visible');
    btnOcultar.setAttribute('aria-pressed', String(oculto));
    btnOcultar.textContent = oculto ? 'Mostrar' : 'Ocultar';
    btnOcultar.addEventListener('click', () => actualizarCampo(clave, 'visible', oculto, true));
    encabezado.append(titulo, btnOcultar);

    const elastico = DECORATIVOS_ELASTICOS.includes(clave);
    const porcentaje = Math.round((caja.w / fabrica.w) * 100);
    const campoTamano = campoRangoNumero(elastico ? 'Largo (%)' : 'Tamaño (%)', porcentaje, 40, 250, (v) => {
      const actual = ajustes[clave];
      const w = Math.min(ANCHO, Math.round((fabrica.w * v) / 100));
      const h = elastico ? actual.h : Math.round((fabrica.h * v) / 100);
      // crece/achica desde su centro, sin salirse del lienzo
      const x = Math.max(0, Math.min(ANCHO - w, Math.round(actual.x + (actual.w - w) / 2)));
      const y = Math.max(0, Math.min(ALTO - h, Math.round(actual.y + (actual.h - h) / 2)));
      ajustes[clave] = { ...actual, x, y, w, h };
      actualizarCampo(clave, 'w', w, true, false);
    });

    const btnCentrar = document.createElement('button');
    btnCentrar.type = 'button';
    btnCentrar.className = 'boton boton--chico';
    btnCentrar.setAttribute('data-accion', 'editor-centrar-horizontal');
    btnCentrar.append(crearIcono('alinear-centro'), document.createTextNode('Centrar en la imagen'));
    btnCentrar.addEventListener('click', () => actualizarCampo(clave, 'x', Math.round((ANCHO - ajustes[clave].w) / 2), true));

    const ayuda = document.createElement('p');
    ayuda.className = 'texto-tenue';
    ayuda.textContent = 'Es parte del diseño de esta plantilla: se mueve y se agranda arrastrando sobre la imagen, igual que los textos.';
    panel.append(encabezado, campoTamano, btnCentrar, ayuda);
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
    if (CLAVES_DECORATIVAS.includes(seleccion)) {
      dibujarPanelDecorativo(seleccion, caja, oculto);
      return;
    }

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

    // Peso: segmentado (mismo componente que "Entera/Llenar la pantalla" de Ajustes), no botones
    // sueltos — ronda "reskin plantilla".
    const segPeso = document.createElement('div');
    segPeso.className = 'segmentado';
    segPeso.setAttribute('role', 'radiogroup');
    segPeso.setAttribute('aria-label', 'Peso de la tipografía');
    for (const [etiqueta, valor] of [['Normal', 400], ['Negrita', 800]]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.className = 'segmentado__opcion' + (caja.peso === valor ? ' segmentado__opcion--activa' : '');
      btn.textContent = etiqueta;
      btn.setAttribute('data-accion', `editor-peso-${valor}`);
      btn.setAttribute('aria-checked', String(caja.peso === valor));
      btn.addEventListener('click', () => actualizarCampo(seleccion, 'peso', valor, true));
      segPeso.append(btn);
    }
    panel.append(segPeso);

    panel.append(campoColor('Color del texto', caja.color, (v, conPanel) => actualizarCampo(seleccion, 'color', v, true, conPanel)));

    // "Alineación y Contraste" (editar_plantilla_natural): tarjeta propia con 2 columnas —
    // "Alineación texto" (segmentado de 3 íconos) + "Fondo del texto" (los 5 presets reales, como
    // muestras de color — el mock solo tiene 2, pero acá no se recorta funcionalidad). "Centrar
    // horizontal" (extra de esta app, no está en el mock) queda debajo, dentro de la misma tarjeta.
    const tarjetaAlineacion = document.createElement('div');
    tarjetaAlineacion.className = 'panel editor-plantilla__panel-alineacion';
    const tituloAlineacion = document.createElement('div');
    tituloAlineacion.className = 'grupo__titulo';
    tituloAlineacion.textContent = 'Alineación y contraste';
    tarjetaAlineacion.append(tituloAlineacion);

    const gridAlineacion = document.createElement('div');
    gridAlineacion.className = 'editor-plantilla__grid-2';

    const colAlineacion = document.createElement('div');
    colAlineacion.className = 'campo';
    const labelAlineacion = document.createElement('label');
    labelAlineacion.className = 'campo__etiqueta';
    labelAlineacion.textContent = 'Alineación texto';
    const segAlineacion = document.createElement('div');
    segAlineacion.className = 'segmentado segmentado--3';
    segAlineacion.setAttribute('role', 'radiogroup');
    segAlineacion.setAttribute('aria-label', 'Alineación del texto');
    for (const [icono, valor] of [
      ['alinear-izquierda', 'left'],
      ['alinear-centro', 'center'],
      ['alinear-derecha', 'right'],
    ]) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.className = 'segmentado__opcion' + (caja.alineacion === valor ? ' segmentado__opcion--activa' : '');
      btn.setAttribute('data-accion', `editor-alineacion-${valor}`);
      btn.setAttribute('aria-checked', String(caja.alineacion === valor));
      btn.setAttribute('aria-label', { left: 'Izquierda', center: 'Centro', right: 'Derecha' }[valor]);
      btn.append(crearIcono(icono));
      btn.addEventListener('click', () => actualizarCampo(seleccion, 'alineacion', valor, true));
      segAlineacion.append(btn);
    }
    colAlineacion.append(labelAlineacion, segAlineacion);

    const colFondo = campoPresetsFondo(caja, (presetId) => {
      ajustes[seleccion] = aplicarPresetFondo(ajustes[seleccion], presetId);
      dibujarOverlay();
      solicitarRedibujo();
      guardarEnHistorial(); // un preset = UN paso de deshacer (los 3 campos juntos)
      mostrarToast(`Fondo: ${PRESETS_FONDO_TEXTO.find((p) => p.id === presetId)?.nombre ?? ''}`);
    });

    gridAlineacion.append(colAlineacion, colFondo);
    tarjetaAlineacion.append(gridAlineacion);

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
    tarjetaAlineacion.append(btnCentrar);
    panel.append(tarjetaAlineacion);

    // Ajuste fino del fondo (color libre/opacidad/redondeo) — no está en el mock, que solo ofrece
    // los presets; queda debajo de la tarjeta como control avanzado, sin cortar funcionalidad.
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

  function moverHistorial(paso) {
    const destino = indiceHistorial + paso;
    if (destino < 0 || destino > historial.length - 1) return;
    indiceHistorial = destino;
    ajustes = estructuraClonada(historial[indiceHistorial]);
    persistir();
    dibujarOverlay();
    solicitarRedibujo();
    actualizarBotonesHistorial();
  }
  btnDeshacer.addEventListener('click', () => moverHistorial(-1));
  btnRehacer.addEventListener('click', () => moverHistorial(1));
  btnDeshacerPantalla.addEventListener('click', () => moverHistorial(-1));
  btnRehacerPantalla.addEventListener('click', () => moverHistorial(1));
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
    btnDeshacerPantalla.disabled = btnDeshacer.disabled;
    btnRehacerPantalla.disabled = btnRehacer.disabled;
  }
}

/**
 * Fila de presets de fondo/etiqueta (Fase 2, "S" #3): un toque aplica color+opacidad+radio juntos
 * (`aplicarPresetFondo`, modelo.js), además del color libre de `campoColor`/los deslizadores de
 * abajo. El preset que coincide con la caja actual queda resaltado (mismo criterio visual que
 * `tarjeta-estilo--activa`), incluida "Sin fondo" recién abierto el editor.
 */
// Ronda "reskin plantilla": los 5 presets se muestran como MUESTRAS de color circulares, sin
// texto adentro (editar_plantilla_natural, "Fondo del texto") — el nombre queda en `aria-label`/
// `title` para accesibilidad, no visible en la tarjeta (que ahí es angosta, media columna).
function campoPresetsFondo(caja, onAplicar) {
  const div = document.createElement('div');
  div.className = 'campo';
  const label = document.createElement('label');
  label.className = 'campo__etiqueta';
  label.textContent = 'Fondo del texto';
  const fila = document.createElement('div');
  fila.className = 'editor-plantilla__presets';
  for (const preset of PRESETS_FONDO_TEXTO) {
    const activo =
      (caja.fondoColor || '').toLowerCase() === preset.fondoColor.toLowerCase() &&
      Math.round((caja.fondoOpacidad ?? 0) * 100) === Math.round(preset.fondoOpacidad * 100) &&
      (caja.fondoRadio ?? 0) === preset.fondoRadio;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'editor-plantilla__preset' + (activo ? ' editor-plantilla__preset--activo' : '');
    btn.setAttribute('data-accion', `preset-fondo-${preset.id}`);
    btn.setAttribute('aria-pressed', String(activo));
    btn.setAttribute('aria-label', preset.nombre);
    btn.title = preset.nombre;
    const muestra = document.createElement('span');
    muestra.className = 'editor-plantilla__preset-muestra';
    muestra.style.background = preset.fondoColor;
    muestra.style.opacity = String(Math.max(0.12, preset.fondoOpacidad)); // visible aun en "Sin fondo"
    btn.append(muestra);
    btn.addEventListener('click', () => onAplicar(preset.id));
    fila.append(btn);
  }
  div.append(label, fila);
  return div;
}

function estructuraClonada(obj) {
  return JSON.parse(JSON.stringify(obj));
}
