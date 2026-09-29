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
// Galería de presets de composición (Fase 4, "catálogo de presets", 2026-09-28): banner inferior/
// editorial/polaroid/story inmersiva son, para el modelo, 4 estilos de imagen más (mismo
// `ESTILOS_CON_AJUSTES`/`AJUSTES_POR_DEFECTO_POR_ESTILO` que foto-precio/foto-descripcion/
// mi-plantilla — ver modelo.js) — lo único nuevo es la fila `PRESETS_COMPOSICION` con miniaturas EN
// VIVO (mismo `tarjetaEstilo`/`componerMiniatura` que Ajustes) para elegirlos con un toque sin salir
// del editor, con un "Deshacer" corto para el estilo general anterior.
import * as repo from '../repositorio.js';
import { dibujarSegunEstilo, componerMiniatura, ANCHO, ALTO } from '../componer.js';
import { cargarFuentes } from '../fuentes.js';
import { elementoEnPunto, moverCaja, redimensionarCaja, aplicarSnap, acomodarAutomatico } from '../editor-geometria.js';
import {
  ESTILOS_IMAGEN,
  ESTILOS_CON_AJUSTES,
  ETIQUETA_ESTILO,
  FUENTES_DISPONIBLES,
  ETIQUETA_FUENTE,
  AJUSTES_POR_DEFECTO_POR_ESTILO,
  esAjustePersonalizado,
  resolverDescripcion,
  PRESETS_FONDO_TEXTO,
  aplicarPresetFondo,
  PRESETS_COMPOSICION,
} from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { crearIcono } from '../utils/iconos.js';
import { mostrarToast } from '../utils/toast.js';
import { fotoDeEjemploPorDefecto } from '../utils/foto-ejemplo.js';
import { tarjetaEstilo, mostrarMiniatura } from './ajustes.js';

const COLORES_RAPIDOS = ['#ffffff', '#242220', '#3a4d39', '#6e5b49', '#f5a623', '#3f5c38'];
const CLAVES_TEXTO = ['nombre', 'precio', 'descripcion'];
const HANDLES = ['nw', 'ne', 'sw', 'se'];

// Blobs de las miniaturas de la galería de presets (Fase 4): urls de objeto que hay que revocar
// para no perder memoria — mismo criterio que `urlsMiniaturas` en ajustes.js.
let urlsGaleriaPresets = [];
function limpiarUrlsGaleriaPresets() {
  urlsGaleriaPresets.forEach((u) => URL.revokeObjectURL(u));
  urlsGaleriaPresets = [];
}

// El "Deshacer preset" de la galería tiene que sobrevivir a `render()`: aplicar un preset DISTINTO
// del que se está editando navega a `#/plantilla?estilo=<preset>` (ronda "editar ahí mismo"), lo
// que destruye y reconstruye toda la pantalla — un `let` local se perdería en esa reconstrucción
// justo antes de mostrarse. Vive a nivel de módulo, como `urlsGaleriaPresets`.
let deshacerPresetPendiente = null; // { anterior } — null si no hay nada para deshacer

export async function render(contenedor, { navegar, params } = {}) {
  contenedor.textContent = '';
  limpiarUrlsGaleriaPresets();

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

  // --- Galería "Estilo de las imágenes" (los 8 estilos, elegís cuál se aplica por defecto a cada
  // producto) — vivía en Ajustes hasta la ronda "orden del diseño" (CREAR-BRIEF.md 2026-09-29): el
  // mock de Ajustes no la tiene entre Encuadre y Texto que acompaña, así que se muda acá entera, con
  // el MISMO componente (`tarjetaEstilo`/`mostrarMiniatura` de ajustes.js) y el mismo criterio
  // (seleccionar = solo fijar el estilo general, sin navegar; "Editar" navega a afinarlo acá mismo).
  // Namespaced como `estilo-general-*`/`editar-estilo-general-*` para no chocar con los
  // `estilo-*` de "Presets de composición" (grilla más abajo, que sí selecciona-y-navega-y-permite-
  // deshacer: una interacción distinta, pensada para probar rápido sin salir del editor). ---
  const panelEstiloGeneral = document.createElement('div');
  panelEstiloGeneral.className = 'panel';
  const tituloEstiloGeneral = document.createElement('div');
  tituloEstiloGeneral.className = 'grupo__titulo';
  tituloEstiloGeneral.textContent = 'Estilo de las imágenes';
  const subtituloEstiloGeneral = document.createElement('p');
  subtituloEstiloGeneral.className = 'panel__subtitulo';
  subtituloEstiloGeneral.textContent =
    'Elegís cómo se ve el estado de cada producto por defecto. Podés cambiarlo por producto en "Opciones avanzadas" del alta/edición.';
  const grillaEstiloGeneral = document.createElement('div');
  grillaEstiloGeneral.className = 'grilla-estilos grilla-estilos--general';
  const tarjetasEstiloGeneral = {};
  for (const valor of ESTILOS_IMAGEN) {
    const editableGeneral = ESTILOS_CON_AJUSTES.includes(valor);
    const tarjeta = tarjetaEstilo(valor, general.estiloGeneral === valor, {
      editable: editableGeneral,
      onSeleccionar: async () => {
        await repo.guardarEstiloGeneral(valor);
        general.estiloGeneral = valor;
        for (const v of ESTILOS_IMAGEN) {
          tarjetasEstiloGeneral[v].raiz.classList.toggle('tarjeta-estilo--activa', v === valor);
          tarjetasEstiloGeneral[v].btnSeleccionar.setAttribute('aria-pressed', String(v === valor));
        }
        mostrarToast(`Estilo general: ${ETIQUETA_ESTILO[valor]}`);
      },
      onEditar: editableGeneral ? () => navegar(`#/plantilla?estilo=${valor}`) : null,
      prefijo: 'estilo-general',
    });
    tarjetasEstiloGeneral[valor] = tarjeta;
    grillaEstiloGeneral.append(tarjeta.raiz);
  }
  panelEstiloGeneral.append(tituloEstiloGeneral, subtituloEstiloGeneral, grillaEstiloGeneral);

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
  selectorEstilo.append(filaLabelEstilo, selectEstilo);

  // --- Galería de presets de composición (Fase 4, "catálogo de presets") ---
  // Reusa la MISMA tarjeta con miniatura en vivo de Ajustes (`tarjetaEstilo`/`mostrarMiniatura`,
  // exportadas desde ajustes.js) para no duplicar el componente. Un toque: (1) aplica el preset
  // como estilo general — igual que elegirlo en Ajustes — y (2) pasa a editarlo acá mismo (como ya
  // hace el selector de arriba). Queda un "Deshacer" corto para volver al estilo general anterior
  // sin tener que ir a buscarlo a Ajustes.
  //
  // Va ARRIBA del lienzo, como "Presets de diseño rápidos" en editar_plantilla_natural — SIN
  // tarjeta `.panel` propia (el mock no le pone fondo/borde a la sección, solo a cada tarjeta
  // individual). BUGS.md #48/#50 documentaban que esto rompía el arrastre del lienzo (quedaba
  // detrás de la nav inferior fija): la causa real era que el lienzo podía terminar en cualquier
  // punto de la pantalla sin que nada lo garantizara visible — la solución correcta es que los
  // tests de arrastre hagan scroll hasta el lienzo antes de leer `boundingBox()`/arrastrar (lo que
  // hacen ahora), no esconder el diseño.
  const galeriaPresets = document.createElement('div');
  galeriaPresets.className = 'editor-plantilla__seccion';
  const cabeceraGaleria = document.createElement('div');
  cabeceraGaleria.className = 'panel__cabecera';
  const tituloGaleria = document.createElement('span');
  tituloGaleria.className = 'grupo__titulo';
  tituloGaleria.textContent = 'Presets de diseño rápidos';
  const contadorGaleria = document.createElement('span');
  contadorGaleria.className = 'panel__badge';
  contadorGaleria.textContent = `${PRESETS_COMPOSICION.length} disponibles`;
  cabeceraGaleria.append(tituloGaleria, contadorGaleria);
  const filaPresets = document.createElement('div');
  filaPresets.className = 'grilla-estilos grilla-estilos--galeria';
  const tarjetasPresets = {};
  const filaDeshacerPreset = document.createElement('div');
  filaDeshacerPreset.className = 'fila';
  filaDeshacerPreset.hidden = !deshacerPresetPendiente; // sobrevive a la navegación (ver arriba)
  const btnDeshacerPreset = document.createElement('button');
  btnDeshacerPreset.type = 'button';
  btnDeshacerPreset.className = 'boton boton--chico boton--fantasma';
  btnDeshacerPreset.setAttribute('data-accion', 'deshacer-preset');
  btnDeshacerPreset.textContent = 'Deshacer preset';
  btnDeshacerPreset.addEventListener('click', async () => {
    if (!deshacerPresetPendiente) return;
    const { anterior } = deshacerPresetPendiente;
    await repo.guardarEstiloGeneral(anterior);
    general.estiloGeneral = anterior;
    deshacerPresetPendiente = null;
    filaDeshacerPreset.hidden = true;
    mostrarToast('Preset deshecho');
    if (ESTILOS_CON_AJUSTES.includes(anterior) && anterior !== estiloEditando) navegar(`#/plantilla?estilo=${anterior}`);
  });
  filaDeshacerPreset.append(btnDeshacerPreset);
  // Subtítulo corto por preset (editar_plantilla_natural: "nombre" + "subtítulo" + pill "Activo"
  // en la tarjeta elegida) — mismas palabras que el mock para estos MISMOS 4 presets reales, no
  // nombres inventados.
  const SUBTITULO_PRESET = {
    'banner-inferior': 'Contraste alto',
    editorial: 'Asimétrico',
    polaroid: 'Instantánea',
    'story-inmersiva': 'A sangre',
  };
  for (const valor of PRESETS_COMPOSICION) {
    const tarjeta = tarjetaEstilo(valor, general.estiloGeneral === valor, {
      editable: false,
      subtitulo: SUBTITULO_PRESET[valor],
      mostrarActivoPill: true,
      onSeleccionar: async () => {
        const anterior = general.estiloGeneral;
        await repo.guardarEstiloGeneral(valor);
        general.estiloGeneral = valor;
        mostrarToast(`Preset aplicado: ${ETIQUETA_ESTILO[valor]}`);
        if (anterior !== valor) {
          deshacerPresetPendiente = { anterior };
          filaDeshacerPreset.hidden = false;
        }
        if (valor !== estiloEditando) navegar(`#/plantilla?estilo=${valor}`);
      },
    });
    tarjetasPresets[valor] = tarjeta;
    filaPresets.append(tarjeta.raiz);
  }
  galeriaPresets.append(cabeceraGaleria, filaPresets, filaDeshacerPreset);

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

  // --- Cabecera de la vista previa: "Previsualización de estado (9:16)" + "● Guías interactivas"
  // EN LA MISMA LÍNEA (editar_plantilla_natural) — `flex-wrap: nowrap` a propósito, con el punto
  // de color que trae el mock delante del texto. ---
  const cabeceraPrevia = document.createElement('div');
  cabeceraPrevia.className = 'panel__cabecera editor-plantilla__cabecera-previa';
  const tituloPrevia = document.createElement('span');
  tituloPrevia.className = 'grupo__titulo';
  tituloPrevia.textContent = 'Previsualización de estado (9:16)';
  const pistaPrevia = document.createElement('span');
  pistaPrevia.className = 'texto-tenue editor-plantilla__pista';
  const puntoPrevia = document.createElement('span');
  puntoPrevia.className = 'editor-plantilla__punto';
  pistaPrevia.append(puntoPrevia, document.createTextNode('Guías interactivas'));
  cabeceraPrevia.append(tituloPrevia, pistaPrevia);

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
  panelControles.append(selectorEstilo, grupoSubida, filaHistorial);

  // Orden final, de arriba a abajo, calcado de editar_plantilla_natural: barra superior propia →
  // tarjeta de controles → "Presets de diseño rápidos" (tira horizontal) → cabecera de la vista
  // previa → lienzo → Capas y visibilidad → panel de propiedades (con "Alineación y Contraste") →
  // "Estilo de las imágenes" (galería de 8, ex-Ajustes, sin equivalente en ESTE mock puntual).
  wrap.append(
    barraSuperior,
    panelControles,
    galeriaPresets,
    cabeceraPrevia,
    previaContenedor,
    capas,
    panel,
    panelEstiloGeneral
  );
  contenedor.append(wrap);

  actualizarBotonesHistorial();
  dibujarOverlay();
  ajustarResolucionCanvas();
  solicitarRedibujo();
  generarMiniaturasPresets();
  generarMiniaturasEstiloGeneral();

  const resizeObserver = new ResizeObserver(() => {
    ajustarResolucionCanvas();
    solicitarRedibujo();
  });
  resizeObserver.observe(previaContenedor);

  // ================= Lógica =================

  function clavesVisiblesParaEstilo() {
    return estiloEditando === 'mi-plantilla' ? ['foto', ...CLAVES_TEXTO] : CLAVES_TEXTO;
  }

  // Solo los elementos VISIBLES son "clickeables" directo sobre el lienzo (ver dibujarOverlay: un
  // elemento oculto no dibuja caja en el overlay, igual que el mock no lo dibuja en la
  // previsualización) — para reactivarlo hay que ir a "Capas y visibilidad".
  function cajasHitTest() {
    return clavesVisiblesParaEstilo()
      .map((clave) => ({ clave, ...ajustes[clave] }))
      .filter((caja) => caja.visible !== false);
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

  // Miniaturas REALES de la galería de presets (Fase 4): mismo `componerMiniatura` de Ajustes, con
  // el producto de ejemplo ya cargado arriba (`productoEjemplo`/`fotoEjemplo`) — nada de imágenes
  // de relleno. Cada preset usa sus PROPIOS ajustes guardados (o sus defaults si nunca se tocó),
  // no los de `estiloEditando`.
  async function generarMiniaturasPresets() {
    await Promise.all(
      PRESETS_COMPOSICION.map(async (valor) => {
        try {
          const blob = await componerMiniatura({
            estilo: valor,
            plantillaImagen: plantillaImagenActual,
            fotoImagen: fotoEjemplo,
            producto: productoEjemplo,
            ajustes: config.ajustesPorEstilo[valor] ?? AJUSTES_POR_DEFECTO_POR_ESTILO[valor],
            formatoPrecio,
            descripcion: descripcionEjemplo,
            encuadreFoto: general.encuadreFoto,
          });
          const url = URL.createObjectURL(blob);
          urlsGaleriaPresets.push(url);
          mostrarMiniatura(tarjetasPresets[valor].marco, url, `Vista previa del preset ${ETIQUETA_ESTILO[valor]}`);
        } catch {
          // una miniatura que falla no rompe el resto de la galería
        }
      })
    );
  }

  // Miniaturas REALES de "Estilo de las imágenes" (los 8, ex-Ajustes — ronda "orden del diseño"):
  // mismo criterio que `generarMiniaturasPresets`, pero para TODOS los estilos, cada uno con sus
  // propios ajustes guardados (o `{}` para "solo-foto", que no tiene ajustes propios).
  async function generarMiniaturasEstiloGeneral() {
    await Promise.all(
      ESTILOS_IMAGEN.map(async (valor) => {
        try {
          const ajustesEstilo = config.ajustesPorEstilo[valor] ?? null;
          const blob = await componerMiniatura({
            estilo: valor,
            plantillaImagen: plantillaImagenActual,
            fotoImagen: fotoEjemplo,
            producto: productoEjemplo,
            ajustes: ajustesEstilo ?? {},
            formatoPrecio,
            descripcion: descripcionEjemplo,
            encuadreFoto: general.encuadreFoto,
          });
          const url = URL.createObjectURL(blob);
          urlsGaleriaPresets.push(url);
          mostrarMiniatura(tarjetasEstiloGeneral[valor].marco, url, `Vista previa del estilo ${ETIQUETA_ESTILO[valor]}`);
          if (tarjetasEstiloGeneral[valor].badge) {
            const personalizado = ajustesEstilo ? esAjustePersonalizado(valor, ajustesEstilo) : false;
            tarjetasEstiloGeneral[valor].badge.hidden = !personalizado;
          }
        } catch {
          // una miniatura que falla no rompe el resto de la galería
        }
      })
    );
  }

  // `conPanel: false` redibuja el overlay/capas pero deja el panel de propiedades como está: si se
  // rehiciera, el deslizador que el dedo está arrastrando se reemplaza por uno nuevo y el gesto se
  // corta después del primer paso (QA v4, BUGS.md).
  function dibujarOverlay({ conPanel = true } = {}) {
    overlay.textContent = '';
    const claves = clavesVisiblesParaEstilo();

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
    capas.append(cabeceraCapas);

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
      }

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

  // Badge de la barra superior: SIEMPRE visible, con 2 estados ("Por defecto"/"Personalizado") —
  // antes aparecía/desaparecía con `hidden` (editar_plantilla_natural lo muestra siempre).
  function actualizarBadgePersonalizado() {
    const personalizado = esAjustePersonalizado(estiloEditando, ajustes);
    badgeEstado.textContent = personalizado ? 'Personalizado' : 'Por defecto';
    badgeEstado.classList.toggle('editor-plantilla__badge--por-defecto', !personalizado);
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

    // "Alineación y Contraste" (editar_plantilla_natural): agrupa visualmente la alineación y los
    // fondos rápidos de texto — mismos controles de siempre (alineación, centrar, color, fondos
    // predefinidos con sus 5 presets reales, no los 2 del mock), solo con el rótulo del diseño.
    const tituloAlineacion = document.createElement('div');
    tituloAlineacion.className = 'grupo__titulo';
    tituloAlineacion.textContent = 'Alineación y contraste';
    panel.append(tituloAlineacion);

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
    panel.append(campoPresetsFondo(caja, (presetId) => {
      ajustes[seleccion] = aplicarPresetFondo(ajustes[seleccion], presetId);
      dibujarOverlay();
      solicitarRedibujo();
      guardarEnHistorial(); // un preset = UN paso de deshacer (los 3 campos juntos)
      mostrarToast(`Fondo: ${PRESETS_FONDO_TEXTO.find((p) => p.id === presetId)?.nombre ?? ''}`);
    }));
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

/**
 * Fila de presets de fondo/etiqueta (Fase 2, "S" #3): un toque aplica color+opacidad+radio juntos
 * (`aplicarPresetFondo`, modelo.js), además del color libre de `campoColor`/los deslizadores de
 * abajo. El preset que coincide con la caja actual queda resaltado (mismo criterio visual que
 * `tarjeta-estilo--activa`), incluida "Sin fondo" recién abierto el editor.
 */
function campoPresetsFondo(caja, onAplicar) {
  const div = document.createElement('div');
  div.className = 'campo';
  const label = document.createElement('label');
  label.className = 'campo__etiqueta';
  label.textContent = 'Fondos predefinidos';
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
    const muestra = document.createElement('span');
    muestra.className = 'editor-plantilla__preset-muestra';
    muestra.style.background = preset.fondoColor;
    muestra.style.opacity = String(Math.max(0.12, preset.fondoOpacidad)); // visible aun en "Sin fondo"
    muestra.style.borderRadius = `${Math.min(preset.fondoRadio, 12)}px`;
    btn.append(muestra, document.createTextNode(preset.nombre));
    btn.addEventListener('click', () => onAplicar(preset.id));
    fila.append(btn);
  }
  div.append(label, fila);
  return div;
}

function estructuraClonada(obj) {
  return JSON.parse(JSON.stringify(obj));
}
