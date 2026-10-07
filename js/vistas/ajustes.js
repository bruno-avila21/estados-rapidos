// Pantalla "Ajustes": encuadre de la foto, texto que acompaña (plantilla de descripción + formato
// de precio), tu plantilla y datos. CREAR-BRIEF.md, ronda 2026-09-27; ronda "ajustes por estilo"
// 2026-09-28; reskin "Organic Minimalist" 2026-09-28 (Interfaz/stitch_.../
// ajustes_de_publicaci_n_natural): tarjetas `.panel` con ícono+título (igual que Secciones/
// Respaldo), encuadre como selector segmentado, chips de variable que insertan en el editor,
// editor de plantilla con contador de carácteres real y vista previa de copia. El mock no modela
// "Tu plantilla" ni "Datos" — se mantienen con el mismo lenguaje visual (`.panel` + ícono) porque
// son funciones reales de la app.
// Ronda "orden del diseño" (CREAR-BRIEF.md 2026-09-29): la galería "Estilo de las imágenes" (8
// tarjetas con miniatura en vivo) se saca de acá — el mock no la tiene entre Encuadre y Texto que
// acompaña, y la elección de estilo/preset pasa a vivir en la pantalla Plantilla (`tarjetaEstilo`/
// `mostrarMiniatura` siguen acá, exportadas, porque plantilla.js las reusa para su propia galería
// de presets). Queda una fila compacta ("Estilo de las imágenes: <actual> ›") que abre Plantilla —
// desde 2026-10-03 dentro del panel "Tu plantilla", que pasó a ser lo PRIMERO de la pantalla.
import * as repo from '../repositorio.js';
import { ETIQUETA_ESTILO, ENCUADRES_FOTO, ETIQUETA_ENCUADRE_FOTO, aplicarPlantillaDescripcion } from '../modelo.js';
import { mostrarToast } from '../utils/toast.js';
import { crearIcono } from '../utils/iconos.js';
import { crearVistaPrevia } from '../utils/vista-previa-viva.js';
import { ESTILOS_CON_DESCRIPCION } from '../componer.js';
import { seccionLaApp } from './ajustes-la-app.js';
import { MODOS, TONOS, leerTema, guardarTema } from '../utils/tema.js';

let debounce = null;

// Íconos del encuadre (Material "aspect_ratio"/"fullscreen"): mismo orden que ENCUADRES_FOTO.
const ICONO_ENCUADRE = { contain: 'encuadre-entero', cover: 'pantalla-completa' };

export async function render(contenedor, { navegar }) {
  contenedor.textContent = '';

  const general = await repo.obtenerAjustesGenerales();
  const plantillaConfig = await repo.obtenerPlantillaConfig();
  const formatoPrecio = { ...plantillaConfig.formatoPrecio };
  const productos = await repo.listarProductos();

  const wrap = document.createElement('div');
  wrap.className = 'pila';

  // --- H1 real de la pantalla (el header compartido muestra la marca "Estados Rápidos" + el
  // subtítulo "Ajustes de Publicación" — ver main.js). ---
  const cabeceraPagina = document.createElement('div');
  cabeceraPagina.className = 'pagina__cabecera';
  const h1Pagina = document.createElement('h1');
  h1Pagina.className = 'pagina__titulo pagina__titulo--medio';
  h1Pagina.textContent = 'Ajustes';
  const subtituloPagina = document.createElement('p');
  subtituloPagina.className = 'pagina__subtitulo';
  subtituloPagina.textContent =
    'Configurá la composición visual, las leyendas de portapapeles y los estándares numéricos para tus publicaciones.';
  const textosPagina = document.createElement('div');
  textosPagina.append(h1Pagina, subtituloPagina);
  cabeceraPagina.append(textosPagina);
  wrap.append(cabeceraPagina);

  // --- 0) Tu plantilla: lo PRIMERO es la vista previa (pedido 2026-10-07 — "para ver cómo queda"):
  // el estado tal cual saldría hoy, con el nombre de la plantilla en uso y dos salidas: cambiarla
  // (pantalla "Plantillas", con favoritas) o editarla (editor). Tocar la imagen la abre completa.
  const panelPlantilla = panel('lapiz', 'Tu plantilla', {
    subtitulo: 'Así salen tus estados ahora. Tocá la imagen para verla completa.',
  });
  const vistaPlantilla = crearVistaPrevia({ titulo: 'Así se ve tu estado', accion: 'ver-completa', obtenerOpciones: () => ({}) });
  vistaPlantilla.actualizar({ inmediato: true });
  const enUso = document.createElement('p');
  enUso.className = 'ajustes__plantilla-en-uso';
  const etiquetaEnUso = document.createElement('span');
  etiquetaEnUso.className = 'texto-tenue';
  etiquetaEnUso.textContent = 'Plantilla en uso';
  const valorAccesoEstilo = document.createElement('strong');
  valorAccesoEstilo.setAttribute('data-dato', 'plantilla-en-uso');
  valorAccesoEstilo.textContent = ETIQUETA_ESTILO[general.estiloGeneral] ?? ETIQUETA_ESTILO['solo-foto'];
  enUso.append(etiquetaEnUso, valorAccesoEstilo);

  const accionesPlantilla = document.createElement('div');
  accionesPlantilla.className = 'panel__acciones panel__acciones--par';
  const btnCambiar = document.createElement('button');
  btnCambiar.type = 'button';
  btnCambiar.className = 'boton';
  btnCambiar.setAttribute('data-accion', 'ir-plantillas');
  btnCambiar.append(crearIcono('grilla'), document.createTextNode('Cambiar'));
  btnCambiar.addEventListener('click', () => navegar('#/plantillas'));
  const enlacePlantilla = document.createElement('button');
  enlacePlantilla.type = 'button';
  enlacePlantilla.className = 'boton boton--primario';
  enlacePlantilla.setAttribute('data-accion', 'ir-plantilla');
  enlacePlantilla.append(crearIcono('lapiz'), document.createTextNode('Editar'));
  enlacePlantilla.addEventListener('click', () => navegar('#/plantilla'));
  accionesPlantilla.append(btnCambiar, enlacePlantilla);
  panelPlantilla.append(vistaPlantilla.raiz, enUso, accionesPlantilla);
  wrap.append(panelPlantilla);

  // El resto de Ajustes va PLEGADO, un bloque por responsabilidad (pedido 2026-10-07: "dividir los
  // sectores… ocultos a mostrar… menos caótico"): se abre solo el que se necesita.
  // --- 1) Encuadre de la foto: selector segmentado (2 opciones) ---
  const panelEncuadre = panel('recortar', 'Encuadre de la foto', { plegable: 'encuadre', badge: ETIQUETA_ENCUADRE_FOTO[general.encuadreFoto] });
  const segmentado = document.createElement('div');
  segmentado.className = 'segmentado';
  segmentado.setAttribute('role', 'radiogroup');
  segmentado.setAttribute('aria-label', 'Tipo de encuadre');
  for (const valor of ENCUADRES_FOTO) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.className = 'segmentado__opcion' + (general.encuadreFoto === valor ? ' segmentado__opcion--activa' : '');
    btn.setAttribute('data-accion', `encuadre-${valor}`);
    btn.setAttribute('aria-checked', String(general.encuadreFoto === valor));
    btn.setAttribute('aria-pressed', String(general.encuadreFoto === valor));
    btn.append(
      crearIcono(ICONO_ENCUADRE[valor]),
      document.createTextNode(ETIQUETA_ENCUADRE_FOTO[valor] + (valor === 'contain' ? ' (defecto)' : ''))
    );
    btn.addEventListener('click', async () => {
      await repo.guardarEncuadreFoto(valor);
      general.encuadreFoto = valor;
      segmentado.querySelectorAll('.segmentado__opcion').forEach((b) => {
        const esEste = b === btn;
        b.classList.toggle('segmentado__opcion--activa', esEste);
        b.setAttribute('aria-checked', String(esEste));
        b.setAttribute('aria-pressed', String(esEste));
      });
      panelEncuadre.querySelector('.panel__badge').textContent = ETIQUETA_ENCUADRE_FOTO[valor];
      vistaPlantilla.actualizar({ inmediato: true });
      mostrarToast(`Encuadre: ${ETIQUETA_ENCUADRE_FOTO[valor]}`);
    });
    segmentado.append(btn);
  }
  const explicacionEncuadre = document.createElement('p');
  explicacionEncuadre.className = 'panel__subtitulo panel__subtitulo--pie';
  explicacionEncuadre.textContent =
    'Preserva las proporciones originales del artículo sin recortes perimetrales al generar el lienzo para el estado.';
  panelEncuadre.append(segmentado, explicacionEncuadre);
  wrap.append(panelEncuadre);

  // --- 2) Texto que acompaña: chips de variable (insertan en el editor), plantilla de
  // descripción con contador real y vista previa de copia, + formato de precio. ---
  const panelTexto = panel('portapapeles', 'Texto que acompaña', {
    plegable: 'texto',
    subtitulo:
      'La leyenda que se copia al portapapeles y se ve en los estilos con descripción. Se usa si el producto no tiene su propia descripción cargada.',
  });

  const variableChips = document.createElement('div');
  variableChips.className = 'variable-chips';
  const etiquetaChips = document.createElement('span');
  etiquetaChips.className = 'variable-chips__etiqueta';
  etiquetaChips.textContent = 'Variables dinámicas disponibles:';
  variableChips.append(etiquetaChips);
  const filaChips = document.createElement('div');
  filaChips.style.display = 'flex';
  filaChips.style.flexWrap = 'wrap';
  filaChips.style.gap = '8px';
  variableChips.append(filaChips);

  const editorTexto = document.createElement('div');
  editorTexto.className = 'editor-texto';
  const labelModelo = document.createElement('label');
  labelModelo.className = 'campo__etiqueta';
  labelModelo.htmlFor = 'campo-descripcion-modelo';
  labelModelo.textContent = 'Plantilla de descripción';
  const textareaModelo = document.createElement('textarea');
  textareaModelo.id = 'campo-descripcion-modelo';
  textareaModelo.maxLength = 300;
  textareaModelo.value = general.descripcionModelo;
  textareaModelo.rows = 3;

  for (const variable of ['{nombre}', '{precio}', '{descripcion}']) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'variable-chip';
    chip.append(document.createTextNode(variable), crearIcono('agregar'));
    chip.addEventListener('click', () => {
      const inicio = textareaModelo.selectionStart ?? textareaModelo.value.length;
      const fin = textareaModelo.selectionEnd ?? textareaModelo.value.length;
      const valor = textareaModelo.value;
      textareaModelo.value = `${valor.slice(0, inicio)}${variable} ${valor.slice(fin)}`;
      textareaModelo.focus();
      textareaModelo.dispatchEvent(new Event('input'));
    });
    filaChips.append(chip);
  }

  const pieEditor = document.createElement('div');
  pieEditor.className = 'editor-texto__pie';
  const notaSinPrecio = document.createElement('span');
  notaSinPrecio.append(crearIcono('info'), document.createTextNode('Sin precio, se omite automáticamente'));
  const contador = document.createElement('span');
  const actualizarContador = () => {
    contador.textContent = `${textareaModelo.value.length} carácteres`;
  };
  pieEditor.append(notaSinPrecio, contador);
  editorTexto.append(labelModelo, textareaModelo, pieEditor);

  const previaCaja = document.createElement('div');
  previaCaja.className = 'vista-previa-copia';
  const cabeceraPrevia = document.createElement('div');
  cabeceraPrevia.className = 'vista-previa-copia__cabecera';
  const etiquetaPrevia = document.createElement('span');
  etiquetaPrevia.className = 'vista-previa-copia__etiqueta';
  etiquetaPrevia.textContent = 'Vista previa de copia';
  cabeceraPrevia.append(etiquetaPrevia, crearIcono('ojo'));
  const previaModelo = document.createElement('p');
  previaModelo.className = 'vista-previa-copia__texto';
  previaModelo.setAttribute('role', 'status');
  const actualizarPreviaModelo = () => {
    previaModelo.textContent = aplicarPlantillaDescripcion(textareaModelo.value, {
      nombre: 'Remera básica',
      precio: '$ 12.500',
      descripcion: '',
    });
  };
  previaCaja.append(cabeceraPrevia, previaModelo);

  // Vista previa en vivo de la IMAGEN con este texto (pedido 2026-10-03): el primer producto cargado
  // (o el de ejemplo) con la plantilla de descripción tal cual está escrita ahora, aunque todavía no
  // se haya guardado. Si el estilo general no dibuja la descripción, se avisa en vez de dejar a la
  // persona buscando un texto que nunca va a aparecer en la imagen.
  const vistaPrevia = crearVistaPrevia({
    titulo: 'Así se ve tu estado',
    obtenerOpciones: () => ({ general: { descripcionModelo: textareaModelo.value }, soloModelo: true }),
  });
  const previaImagen = document.createElement('div');
  previaImagen.className = 'vista-previa-copia';
  const etiquetaPreviaImagen = document.createElement('span');
  etiquetaPreviaImagen.className = 'vista-previa-copia__etiqueta';
  etiquetaPreviaImagen.textContent = 'Vista previa de la imagen';
  previaImagen.append(etiquetaPreviaImagen, vistaPrevia.raiz);
  if (!ESTILOS_CON_DESCRIPCION.includes(general.estiloGeneral)) {
    const notaEstilo = document.createElement('p');
    notaEstilo.className = 'panel__subtitulo panel__subtitulo--pie';
    notaEstilo.setAttribute('data-nota', 'estilo-sin-descripcion');
    notaEstilo.textContent = `Con el estilo "${ETIQUETA_ESTILO[general.estiloGeneral] ?? ETIQUETA_ESTILO['solo-foto']}" este texto no se dibuja en la imagen: solo se copia para pegarlo. Para verlo en la imagen elegí un estilo con descripción en "Tu plantilla".`;
    previaImagen.append(notaEstilo);
  }
  vistaPrevia.actualizar({ inmediato: true });

  actualizarContador();
  actualizarPreviaModelo();
  textareaModelo.addEventListener('input', () => {
    actualizarContador();
    actualizarPreviaModelo();
    vistaPrevia.actualizar();
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      await repo.guardarDescripcionModelo(textareaModelo.value);
      general.descripcionModelo = textareaModelo.value;
      vistaPlantilla.actualizar();
    }, 350);
  });

  const grupoFormato = document.createElement('div');
  const campoPrefijo = document.createElement('div');
  campoPrefijo.className = 'campo';
  const labelPrefijo = document.createElement('label');
  labelPrefijo.className = 'campo__etiqueta';
  labelPrefijo.htmlFor = 'campo-prefijo-precio';
  labelPrefijo.textContent = 'Prefijo del precio';
  const inputPrefijo = document.createElement('input');
  inputPrefijo.type = 'text';
  inputPrefijo.id = 'campo-prefijo-precio';
  inputPrefijo.maxLength = 6;
  inputPrefijo.value = formatoPrecio.prefijo;
  inputPrefijo.addEventListener('input', () => {
    formatoPrecio.prefijo = inputPrefijo.value;
    guardarFormatoDebounced();
  });
  const ejemploPrefijo = document.createElement('span');
  ejemploPrefijo.className = 'ajustes__ejemplo';
  ejemploPrefijo.textContent = 'Ejemplos: $, USD, ARS, €';
  campoPrefijo.append(labelPrefijo, inputPrefijo, ejemploPrefijo);

  const casillasPrecision = document.createElement('div');
  casillasPrecision.className = 'casillas-precision';
  const casilla = (etiqueta, ayuda, clave) => {
    const fila = document.createElement('label');
    fila.className = 'casilla-fila';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !!formatoPrecio[clave];
    check.addEventListener('change', () => {
      formatoPrecio[clave] = check.checked;
      guardarFormatoDebounced();
    });
    const textos = document.createElement('div');
    textos.className = 'casilla-fila__textos';
    const titulo = document.createElement('span');
    titulo.className = 'casilla-fila__titulo';
    titulo.textContent = etiqueta;
    const sub = document.createElement('span');
    sub.className = 'casilla-fila__ayuda';
    sub.textContent = ayuda;
    textos.append(titulo, sub);
    fila.append(check, textos);
    return fila;
  };
  function guardarFormatoDebounced() {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      await repo.guardarFormatoPrecio(formatoPrecio);
      vistaPlantilla.actualizar();
    }, 300);
  }
  casillasPrecision.append(
    casilla('Separador de miles (es-AR)', 'Formatea valores como 12.500 en lugar de 12500', 'separadorMiles'),
    casilla('Mostrar decimales', 'Incluye centavos al final (ej: $ 12.500,00)', 'decimales')
  );
  grupoFormato.append(campoPrefijo, casillasPrecision);

  panelTexto.append(variableChips, editorTexto, previaCaja, previaImagen);
  wrap.append(panelTexto);

  // --- 4) Prefijo y puntuación monetaria: panel propio (mismo orden que el mock). ---
  const panelMoneda = panel('moneda', 'Formato del precio', { plegable: 'moneda' });
  panelMoneda.append(grupoFormato);
  wrap.append(panelMoneda);

  // --- 6) Datos (no está en el mock — se mantiene igual que arriba). ---
  const panelDatos = panel('carpeta', 'Datos', {
    plegable: 'datos',
    subtitulo: 'Todo vive en este celular. Para exportar, importar o borrar todo, andá a Respaldo.',
  });
  const resumenDatos = document.createElement('p');
  resumenDatos.className = 'texto-tenue';
  resumenDatos.textContent = `${productos.length} producto${productos.length === 1 ? '' : 's'} cargado${productos.length === 1 ? '' : 's'}.`;
  const btnRespaldo = document.createElement('button');
  btnRespaldo.type = 'button';
  btnRespaldo.className = 'boton boton--ancho';
  btnRespaldo.setAttribute('data-accion', 'ir-respaldo');
  btnRespaldo.textContent = 'Ir a Respaldo';
  btnRespaldo.addEventListener('click', () => navegar('#/respaldo'));
  panelDatos.append(resumenDatos, btnRespaldo);
  wrap.append(panelDatos);

  // --- Apariencia (pedido 2026-10-07): modo claro/oscuro/automático y tono de la app. Se aplica
  // al toque y se recuerda en este celular. ---
  const panelApariencia = panel('chispa', 'Apariencia', { plegable: 'apariencia', badge: TONOS[leerTema().tono] });
  const tituloModo = document.createElement('span');
  tituloModo.className = 'apariencia__titulo';
  tituloModo.textContent = 'Modo';
  const segmentadoModo = document.createElement('div');
  segmentadoModo.className = 'segmentado segmentado--3';
  segmentadoModo.setAttribute('role', 'group');
  segmentadoModo.setAttribute('aria-label', 'Modo claro u oscuro');
  const tituloTono = document.createElement('span');
  tituloTono.className = 'apariencia__titulo';
  tituloTono.textContent = 'Tono';
  const grillaTonos = document.createElement('div');
  grillaTonos.className = 'apariencia__tonos';
  grillaTonos.setAttribute('role', 'group');
  grillaTonos.setAttribute('aria-label', 'Tono de la app');
  const pintarApariencia = () => {
    const tema = leerTema();
    segmentadoModo.querySelectorAll('button').forEach((b) => {
      const activo = b.dataset.modo === tema.modo;
      b.classList.toggle('segmentado__opcion--activa', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    grillaTonos.querySelectorAll('button').forEach((b) => {
      const activo = b.dataset.tono === tema.tono;
      b.classList.toggle('apariencia__tono--activo', activo);
      b.setAttribute('aria-pressed', String(activo));
    });
    panelApariencia.querySelector('.panel__badge').textContent = TONOS[tema.tono];
  };
  for (const [modo, etiqueta] of Object.entries(MODOS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'segmentado__opcion';
    btn.dataset.modo = modo;
    btn.setAttribute('data-accion', `modo-${modo}`);
    btn.textContent = etiqueta;
    btn.addEventListener('click', () => {
      guardarTema({ modo });
      pintarApariencia();
    });
    segmentadoModo.append(btn);
  }
  for (const [tono, etiqueta] of Object.entries(TONOS)) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'apariencia__tono';
    btn.dataset.tono = tono;
    btn.setAttribute('data-accion', `tono-${tono}`);
    const muestra = document.createElement('span');
    muestra.className = `apariencia__muestra apariencia__muestra--${tono}`;
    btn.append(muestra, document.createTextNode(etiqueta));
    btn.addEventListener('click', () => {
      guardarTema({ tono });
      pintarApariencia();
      mostrarToast(`Tono: ${etiqueta}`);
    });
    grillaTonos.append(btn);
  }
  pintarApariencia();
  panelApariencia.append(tituloModo, segmentadoModo, tituloTono, grillaTonos);
  wrap.append(panelApariencia);

  wrap.append(seccionLaApp());
  contenedor.append(wrap);
}

/** Tarjeta `.panel` con ícono + título (igual que Secciones/Respaldo), badge opcional a la derecha
 * y párrafo de subtítulo opcional — mismo componente que main.js/secciones.js ya establecieron. */
function panel(icono, titulo, { badge, subtitulo, plegable = null } = {}) {
  const rotulo = document.createElement('span');
  rotulo.className = 'panel__rotulo';
  rotulo.append(crearIcono(icono), document.createTextNode(titulo));
  // `plegable` (2026-10-07): el panel es un <details> cerrado, con el rótulo como <summary> (y el
  // badge, si hay, mostrando el valor actual). El valor de `plegable` es su `data-panel`.
  if (plegable) {
    const det = document.createElement('details');
    det.className = 'panel panel--plegable';
    det.setAttribute('data-panel', plegable);
    const resumen = document.createElement('summary');
    resumen.className = 'panel__resumen';
    resumen.append(rotulo);
    if (badge) {
      const b = document.createElement('span');
      b.className = 'panel__badge';
      b.textContent = badge;
      resumen.append(b);
    }
    resumen.append(crearIcono('chevron-derecha', { clase: 'icono panel__chevron' }));
    det.append(resumen);
    if (subtitulo) {
      const p = document.createElement('p');
      p.className = 'panel__subtitulo';
      p.textContent = subtitulo;
      det.append(p);
    }
    return det;
  }
  const sec = document.createElement('section');
  sec.className = 'panel';
  if (badge) {
    const cabecera = document.createElement('div');
    cabecera.className = 'panel__cabecera';
    rotulo.style.marginBottom = '0';
    const b = document.createElement('span');
    b.className = 'panel__badge';
    b.textContent = badge;
    cabecera.append(rotulo, b);
    sec.append(cabecera);
  } else {
    sec.append(rotulo);
  }
  if (subtitulo) {
    const p = document.createElement('p');
    p.className = 'panel__subtitulo';
    p.textContent = subtitulo;
    sec.append(p);
  }
  return sec;
}

/**
 * Tarjeta de un estilo: marco con placeholder "Generando…" (se reemplaza por el <img> recién
 * cuando hay `src`, nunca antes — así no se ve el ícono de imagen rota mientras se arma la
 * miniatura, BUGS.md ronda "miniaturas con placeholder") + etiqueta, y si `editable` un pie con
 * badge "Personalizado" (oculto hasta que corresponda) y botón "Editar".
 */
/** Exportada para reusarla en las 2 galerías del editor de plantilla (js/vistas/plantilla.js): la
 * misma tarjeta con miniatura en vivo, sin duplicar el componente. `prefijo` namespacea el
 * `data-accion` (default `'estilo'`, igual que siempre) — plantilla.js pasa `'estilo-general'`
 * para su galería "Estilo de las imágenes" (los 8, mueve-y-queda) y así no choca con los
 * `estilo-<preset>` de su galería "Presets de composición" (los 4, selecciona-y-navega-y-deshace),
 * que puede convivir en la misma pantalla (ronda "orden del diseño", CREAR-BRIEF.md 2026-09-29).
 *
 * `subtitulo`/`mostrarActivoPill` (ronda "reskin plantilla"): opcionales, solo los usa la galería
 * "Presets de diseño rápidos" de plantilla.js para acercarse a editar_plantilla_natural (nombre +
 * subtítulo corto + pill "Activo" en la tarjeta elegida) — la galería "Estilo de las imágenes" de
 * Ajustes/Plantilla (`editable: true`) no los pasa y queda IGUAL que antes. */
export function tarjetaEstilo(
  valor,
  activa,
  { editable, onSeleccionar, onEditar, onVerCompleta = null, prefijo = 'estilo', subtitulo = null, mostrarActivoPill = false }
) {
  const raiz = document.createElement('div');
  raiz.className = 'tarjeta-estilo' + (activa ? ' tarjeta-estilo--activa' : '');

  const btnSeleccionar = document.createElement('button');
  btnSeleccionar.type = 'button';
  btnSeleccionar.className = 'tarjeta-estilo__seleccionar';
  btnSeleccionar.setAttribute('data-accion', `${prefijo}-${valor}`);
  btnSeleccionar.setAttribute('aria-pressed', String(activa));

  const marco = document.createElement('div');
  marco.className = 'tarjeta-estilo__marco';
  const placeholder = document.createElement('div');
  placeholder.className = 'tarjeta-estilo__placeholder skeleton';
  placeholder.setAttribute('aria-hidden', 'true');
  const textoPlaceholder = document.createElement('span');
  textoPlaceholder.className = 'tarjeta-estilo__placeholder-texto';
  textoPlaceholder.textContent = 'Generando…';
  placeholder.append(textoPlaceholder);
  marco.append(placeholder);

  const etiqueta = document.createElement('span');
  etiqueta.className = 'tarjeta-estilo__etiqueta';
  etiqueta.textContent = ETIQUETA_ESTILO[valor];

  btnSeleccionar.append(marco, etiqueta);

  let subtituloEl = null;
  if (subtitulo) {
    subtituloEl = document.createElement('span');
    subtituloEl.className = 'tarjeta-estilo__subtitulo';
    subtituloEl.textContent = subtitulo;
    btnSeleccionar.append(subtituloEl);
  }

  let pillActivo = null;
  if (mostrarActivoPill) {
    pillActivo = document.createElement('span');
    pillActivo.className = 'tarjeta-estilo__pill-activo';
    pillActivo.textContent = 'Activo';
    pillActivo.hidden = !activa;
    btnSeleccionar.append(pillActivo);
  }

  btnSeleccionar.addEventListener('click', async () => {
    document.querySelectorAll('.tarjeta-estilo').forEach((t) => {
      t.classList.remove('tarjeta-estilo--activa');
      const p = t.querySelector('.tarjeta-estilo__pill-activo');
      if (p) p.hidden = true;
    });
    document.querySelectorAll('.tarjeta-estilo__seleccionar').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    raiz.classList.add('tarjeta-estilo--activa');
    btnSeleccionar.setAttribute('aria-pressed', 'true');
    if (pillActivo) pillActivo.hidden = false;
    await onSeleccionar();
  });
  raiz.append(btnSeleccionar);

  // "Ver completa": hermano del botón de seleccionar (un <button> no puede anidar otro), flotando
  // sobre la esquina de la miniatura — abre el estado entero en el visor sin cambiar la selección.
  if (onVerCompleta) {
    const btnVer = document.createElement('button');
    btnVer.type = 'button';
    btnVer.className = 'tarjeta-estilo__ver';
    btnVer.setAttribute('data-accion', `ver-${prefijo}-${valor}`);
    btnVer.setAttribute('aria-label', `Ver completa: ${ETIQUETA_ESTILO[valor]}`);
    btnVer.append(crearIcono('pantalla-completa'));
    btnVer.addEventListener('click', onVerCompleta);
    raiz.append(btnVer);
  }

  let badge = null;
  if (editable) {
    const pie = document.createElement('div');
    pie.className = 'tarjeta-estilo__pie';
    badge = document.createElement('span');
    badge.className = 'tarjeta-estilo__badge';
    badge.textContent = 'Personalizado';
    badge.hidden = true;
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'boton boton--chico boton--fantasma';
    btnEditar.setAttribute('data-accion', `editar-${prefijo}-${valor}`);
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', (ev) => {
      ev.stopPropagation();
      onEditar();
    });
    pie.append(badge, btnEditar);
    raiz.append(pie);
  }

  return { raiz, marco, btnSeleccionar, badge };
}

/** Exportada junto con `tarjetaEstilo` para la galería de presets de plantilla.js (Fase 4). */
export function mostrarMiniatura(marco, url, alt) {
  const img = document.createElement('img');
  img.className = 'tarjeta-estilo__miniatura';
  img.alt = alt;
  img.src = url;
  marco.replaceChildren(img);
}
