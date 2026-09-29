// Pantalla "Ajustes": encuadre de la foto, estilo de las imágenes (8 tarjetas con miniatura en
// vivo), texto que acompaña (plantilla de descripción + formato de precio), tu plantilla y datos.
// CREAR-BRIEF.md, ronda 2026-09-27; ronda "ajustes por estilo" 2026-09-28 (badge "Personalizado" +
// botón "Editar" por tarjeta); reskin "Organic Minimalist" 2026-09-28
// (Interfaz/stitch_.../ajustes_de_publicaci_n_natural): tarjetas `.panel` con ícono+título (igual
// que Secciones/Respaldo), encuadre como selector segmentado, chips de variable que insertan en el
// editor, editor de plantilla con contador de carácteres real y vista previa de copia. El mock no
// modela "Estilo de las imágenes" (las 8 tarjetas), "Tu plantilla" ni "Datos" — se mantienen con el
// mismo lenguaje visual (`.panel` + ícono) porque son funciones reales de la app.
import * as repo from '../repositorio.js';
import {
  ESTILOS_IMAGEN,
  ESTILOS_CON_AJUSTES,
  ETIQUETA_ESTILO,
  ENCUADRES_FOTO,
  ETIQUETA_ENCUADRE_FOTO,
  aplicarPlantillaDescripcion,
  resolverDescripcion,
  esAjustePersonalizado,
} from '../modelo.js';
import { componerMiniatura } from '../componer.js';
import { mostrarToast } from '../utils/toast.js';
import { crearIcono } from '../utils/iconos.js';
import { seccionLaApp } from './ajustes-la-app.js';

let debounce = null;
let urlsMiniaturas = [];

// Cache en memoria de miniaturas por (estilo, hash de lo que puede cambiar el dibujo, producto):
// evita rehacer el canvas/JPEG en cada entrada a Ajustes o cambio de un ajuste que no afecta a
// ESTE estilo (ronda "miniaturas con placeholder", 2026-09-28). Vive mientras dure la pestaña —
// se guarda el Blob (no la URL: esa se crea/revoca en cada render de la pantalla).
const cacheMiniaturas = new Map();

// Íconos del encuadre (Material "aspect_ratio"/"fullscreen"): mismo orden que ENCUADRES_FOTO.
const ICONO_ENCUADRE = { contain: 'encuadre-entero', cover: 'pantalla-completa' };

function hashCadena(texto) {
  let h = 0;
  for (let i = 0; i < texto.length; i += 1) h = (Math.imul(31, h) + texto.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export async function render(contenedor, { navegar }) {
  contenedor.textContent = '';
  limpiarUrls();

  const general = await repo.obtenerAjustesGenerales();
  const plantillaConfig = await repo.obtenerPlantillaConfig();
  const formatoPrecio = { ...plantillaConfig.formatoPrecio };
  const productos = await repo.listarProductos();
  const productoEjemplo = productos[0] || { nombre: 'Remera básica', precio: 12500, descripcion: '' };
  const fotoEjemploBlob = productos[0]?.fotoId ? await repo.obtenerFotoBlob(productos[0].fotoId) : null;

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

  // --- 1) Encuadre de la foto: selector segmentado (2 opciones) ---
  const panelEncuadre = panel('recortar', 'Encuadre de la foto', { badge: 'Relación de aspecto' });
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
      mostrarToast(`Encuadre: ${ETIQUETA_ENCUADRE_FOTO[valor]}`);
      regenerarMiniaturas();
    });
    segmentado.append(btn);
  }
  const explicacionEncuadre = document.createElement('p');
  explicacionEncuadre.className = 'panel__subtitulo panel__subtitulo--pie';
  explicacionEncuadre.textContent =
    'Preserva las proporciones originales del artículo sin recortes perimetrales al generar el lienzo para el estado.';
  panelEncuadre.append(segmentado, explicacionEncuadre);
  wrap.append(panelEncuadre);

  // --- 2) Estilo de las imágenes: tarjetas seleccionables con miniatura en vivo (no está en el
  // mock — se mantiene con el mismo lenguaje visual `.panel` que el resto de la pantalla). ---
  const panelEstilo = panel('galeria', 'Estilo de las imágenes', {
    subtitulo: 'Elegís cómo se ve el estado de cada producto. Podés cambiarlo por producto en "Opciones avanzadas" del alta/edición.',
  });
  const grillaEstilos = document.createElement('div');
  grillaEstilos.className = 'grilla-estilos';
  const tarjetasPorEstilo = {};
  for (const valor of ESTILOS_IMAGEN) {
    const editable = ESTILOS_CON_AJUSTES.includes(valor);
    const tarjeta = tarjetaEstilo(valor, general.estiloGeneral === valor, {
      editable,
      onSeleccionar: async () => {
        await repo.guardarEstiloGeneral(valor);
        general.estiloGeneral = valor;
        for (const v of ESTILOS_IMAGEN) {
          tarjetasPorEstilo[v].raiz.classList.toggle('tarjeta-estilo--activa', v === valor);
          tarjetasPorEstilo[v].btnSeleccionar.setAttribute('aria-pressed', String(v === valor));
        }
        mostrarToast(`Estilo general: ${ETIQUETA_ESTILO[valor]}`);
      },
      onEditar: editable ? () => navegar(`#/plantilla?estilo=${valor}`) : null,
    });
    tarjetasPorEstilo[valor] = tarjeta;
    grillaEstilos.append(tarjeta.raiz);
  }
  panelEstilo.append(grillaEstilos);
  wrap.append(panelEstilo);

  // --- 3) Texto que acompaña: chips de variable (insertan en el editor), plantilla de
  // descripción con contador real y vista previa de copia, + formato de precio. ---
  const panelTexto = panel('portapapeles', 'TEXTO QUE ACOMPAÑA', {
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

  actualizarContador();
  actualizarPreviaModelo();
  textareaModelo.addEventListener('input', () => {
    actualizarContador();
    actualizarPreviaModelo();
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      await repo.guardarDescripcionModelo(textareaModelo.value);
      general.descripcionModelo = textareaModelo.value;
      regenerarMiniaturas();
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
      regenerarMiniaturas();
    }, 300);
  }
  casillasPrecision.append(
    casilla('Separador de miles (es-AR)', 'Formatea valores como 12.500 en lugar de 12500', 'separadorMiles'),
    casilla('Mostrar decimales', 'Incluye centavos al final (ej: $ 12.500,00)', 'decimales')
  );
  grupoFormato.append(campoPrefijo, casillasPrecision);

  panelTexto.append(variableChips, editorTexto, previaCaja);
  wrap.append(panelTexto);

  // --- 4) Prefijo y puntuación monetaria: panel propio (mismo orden que el mock). ---
  const panelMoneda = panel('moneda', 'Prefijo y puntuación monetaria');
  panelMoneda.append(grupoFormato);
  wrap.append(panelMoneda);

  // --- 5) Tu plantilla: editor visual (no está en el mock — se mantiene igual que arriba). ---
  const panelPlantilla = panel('lapiz', 'Tu plantilla', {
    subtitulo: 'Ajustá a mano dónde va el nombre, el precio y la descripción, con qué tipografía y color, y (si elegís "Mi plantilla") subí tu propio fondo.',
  });
  const enlacePlantilla = document.createElement('button');
  enlacePlantilla.type = 'button';
  enlacePlantilla.className = 'boton boton--primario boton--ancho';
  enlacePlantilla.setAttribute('data-accion', 'ir-plantilla');
  enlacePlantilla.textContent = 'Abrir editor de plantilla';
  enlacePlantilla.addEventListener('click', () => navegar('#/plantilla'));
  panelPlantilla.append(enlacePlantilla);
  wrap.append(panelPlantilla);

  // --- 6) Datos (no está en el mock — se mantiene igual que arriba). ---
  const panelDatos = panel('carpeta', 'Datos', {
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

  wrap.append(seccionLaApp());
  contenedor.append(wrap);

  function claveProducto(p) {
    return { id: p.id ?? null, nombre: p.nombre, precio: p.precio, descripcion: p.descripcion ?? '', fotoId: p.fotoId ?? null };
  }

  async function regenerarMiniaturas() {
    const config = await repo.obtenerPlantillaConfig();
    // siempre se busca: la tarjeta "Mi plantilla" necesita su miniatura aunque no sea el estilo activo.
    const plantillaBlob = await repo.obtenerImagenPlantillaBlob();
    const plantillaImagen = await createImageBitmap(plantillaBlob);
    const fotoImagen = fotoEjemploBlob ? await createImageBitmap(fotoEjemploBlob) : await fotoDeEjemploPorDefecto();
    const descripcionResuelta = resolverDescripcion(productoEjemplo, { ...general, formatoPrecio: config.formatoPrecio });

    await Promise.all(
      ESTILOS_IMAGEN.map(async (valor) => {
        try {
          const ajustesEstilo = config.ajustesPorEstilo[valor] ?? null;
          const clave = `${valor}:${hashCadena(
            JSON.stringify({
              ajustesEstilo,
              imagenId: config.imagenId,
              formatoPrecio: config.formatoPrecio,
              encuadreFoto: general.encuadreFoto,
              producto: claveProducto(productoEjemplo),
              tieneFoto: !!fotoImagen,
            })
          )}`;
          let blob = cacheMiniaturas.get(clave);
          if (!blob) {
            blob = await componerMiniatura({
              estilo: valor,
              plantillaImagen,
              fotoImagen,
              producto: productoEjemplo,
              ajustes: ajustesEstilo ?? {},
              formatoPrecio: config.formatoPrecio,
              descripcion: descripcionResuelta,
              encuadreFoto: general.encuadreFoto,
            });
            cacheMiniaturas.set(clave, blob);
          }
          const url = URL.createObjectURL(blob);
          urlsMiniaturas.push(url);
          mostrarMiniatura(tarjetasPorEstilo[valor].marco, url, `Vista previa del estilo ${ETIQUETA_ESTILO[valor]}`);
          if (tarjetasPorEstilo[valor].badge) {
            const personalizado = ajustesEstilo ? esAjustePersonalizado(valor, ajustesEstilo) : false;
            tarjetasPorEstilo[valor].badge.hidden = !personalizado;
          }
        } catch {
          // una miniatura que falla no rompe el resto de la pantalla
        }
      })
    );
  }

  await regenerarMiniaturas();
}

let bitmapEjemploPorDefecto = null;
/** Sin ningún producto cargado (recién instalada), las miniaturas usan una foto de ejemplo propia
 * del proyecto en vez de quedar sin foto — assets/ejemplo.jpg (ronda "miniaturas con placeholder",
 * CREAR-BRIEF.md 2026-09-28). Decodificada una sola vez y reusada. */
async function fotoDeEjemploPorDefecto() {
  if (bitmapEjemploPorDefecto) return bitmapEjemploPorDefecto;
  try {
    const respuesta = await fetch('assets/ejemplo.jpg');
    const blob = await respuesta.blob();
    bitmapEjemploPorDefecto = await createImageBitmap(blob);
  } catch {
    bitmapEjemploPorDefecto = null;
  }
  return bitmapEjemploPorDefecto;
}

/** Tarjeta `.panel` con ícono + título (igual que Secciones/Respaldo), badge opcional a la derecha
 * y párrafo de subtítulo opcional — mismo componente que main.js/secciones.js ya establecieron. */
function panel(icono, titulo, { badge, subtitulo } = {}) {
  const sec = document.createElement('section');
  sec.className = 'panel';
  const rotulo = document.createElement('span');
  rotulo.className = 'panel__rotulo';
  rotulo.append(crearIcono(icono), document.createTextNode(titulo));
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
/** Exportada para reusarla en la galería de presets del editor de plantilla (js/vistas/
 * plantilla.js, Fase 4): la misma tarjeta con miniatura en vivo, sin duplicar el componente. */
export function tarjetaEstilo(valor, activa, { editable, onSeleccionar, onEditar }) {
  const raiz = document.createElement('div');
  raiz.className = 'tarjeta-estilo' + (activa ? ' tarjeta-estilo--activa' : '');

  const btnSeleccionar = document.createElement('button');
  btnSeleccionar.type = 'button';
  btnSeleccionar.className = 'tarjeta-estilo__seleccionar';
  btnSeleccionar.setAttribute('data-accion', `estilo-${valor}`);
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
  btnSeleccionar.addEventListener('click', async () => {
    document.querySelectorAll('.tarjeta-estilo').forEach((t) => t.classList.remove('tarjeta-estilo--activa'));
    document.querySelectorAll('.tarjeta-estilo__seleccionar').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    raiz.classList.add('tarjeta-estilo--activa');
    btnSeleccionar.setAttribute('aria-pressed', 'true');
    await onSeleccionar();
  });
  raiz.append(btnSeleccionar);

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
    btnEditar.setAttribute('data-accion', `editar-estilo-${valor}`);
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

function limpiarUrls() {
  urlsMiniaturas.forEach((u) => URL.revokeObjectURL(u));
  urlsMiniaturas = [];
}
