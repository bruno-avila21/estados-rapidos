// Pantalla "Ajustes": 4 secciones con título + explicación (estilo de imagen con tarjetas de
// miniatura en vivo, texto que acompaña, tu plantilla, datos). CREAR-BRIEF.md, ronda 2026-09-27;
// ronda "ajustes por estilo" 2026-09-28 (badge "Personalizado" + botón "Editar" por tarjeta).
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
import { seccionLaApp } from './ajustes-la-app.js';

let debounce = null;
let urlsMiniaturas = [];

// Cache en memoria de miniaturas por (estilo, hash de lo que puede cambiar el dibujo, producto):
// evita rehacer el canvas/JPEG en cada entrada a Ajustes o cambio de un ajuste que no afecta a
// ESTE estilo (ronda "miniaturas con placeholder", 2026-09-28). Vive mientras dure la pestaña —
// se guarda el Blob (no la URL: esa se crea/revoca en cada render de la pantalla).
const cacheMiniaturas = new Map();

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

  // --- 1) Estilo de las imágenes: tarjetas seleccionables con miniatura en vivo ---
  const seccionEstilo = seccion(
    'Estilo de las imágenes',
    'Elegís cómo se ve el estado de cada producto. Podés cambiarlo por producto en "Opciones avanzadas" del alta/edición.'
  );
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
  seccionEstilo.append(grillaEstilos);

  // --- Encuadre de la foto (solo afecta "Foto con precio"/"Foto con descripción": "Solo la foto"
  // y "Mi plantilla" no lo usan) ---
  const campoEncuadre = document.createElement('div');
  campoEncuadre.className = 'campo';
  const labelEncuadre = document.createElement('span');
  labelEncuadre.className = 'campo__etiqueta';
  labelEncuadre.textContent = 'Encuadre de la foto';
  const filaEncuadre = document.createElement('div');
  filaEncuadre.className = 'fila';
  for (const valor of ENCUADRES_FOTO) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'boton boton--chico' + (general.encuadreFoto === valor ? ' tarjeta-estilo--activa' : '');
    btn.setAttribute('data-accion', `encuadre-${valor}`);
    btn.setAttribute('aria-pressed', String(general.encuadreFoto === valor));
    btn.textContent = ETIQUETA_ENCUADRE_FOTO[valor] + (valor === 'contain' ? ' (defecto)' : '');
    btn.addEventListener('click', async () => {
      await repo.guardarEncuadreFoto(valor);
      general.encuadreFoto = valor;
      filaEncuadre.querySelectorAll('button').forEach((b) => {
        const esEste = b === btn;
        b.classList.toggle('tarjeta-estilo--activa', esEste);
        b.setAttribute('aria-pressed', String(esEste));
      });
      mostrarToast(`Encuadre: ${ETIQUETA_ENCUADRE_FOTO[valor]}`);
      regenerarMiniaturas();
    });
    filaEncuadre.append(btn);
  }
  campoEncuadre.append(labelEncuadre, filaEncuadre);
  seccionEstilo.append(campoEncuadre);

  // --- 2) Texto que acompaña: modelo de descripción + formato de precio ---
  const seccionTexto = seccion(
    'Texto que acompaña',
    'La leyenda que se copia al portapapeles y se ve en los estilos "Foto con descripción". Se usa si el producto no tiene su propia descripción cargada.'
  );
  const ayudaModelo = document.createElement('p');
  ayudaModelo.className = 'texto-tenue';
  ayudaModelo.textContent = 'Marcadores disponibles: {nombre} {precio} {descripcion}. Sin precio cargado, {precio} se saca solo (sin dejar "a $" colgando).';
  const textareaModelo = document.createElement('textarea');
  textareaModelo.id = 'campo-descripcion-modelo';
  textareaModelo.maxLength = 300;
  textareaModelo.value = general.descripcionModelo;
  const previaModelo = document.createElement('p');
  previaModelo.className = 'texto-tenue';
  previaModelo.setAttribute('role', 'status');
  const actualizarPreviaModelo = () => {
    previaModelo.textContent =
      'Ejemplo: ' +
      aplicarPlantillaDescripcion(textareaModelo.value, { nombre: 'Remera básica', precio: '$ 12.500', descripcion: '' });
  };
  actualizarPreviaModelo();
  textareaModelo.addEventListener('input', () => {
    actualizarPreviaModelo();
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      await repo.guardarDescripcionModelo(textareaModelo.value);
      general.descripcionModelo = textareaModelo.value;
      regenerarMiniaturas();
    }, 350);
  });

  const grupoFormato = document.createElement('div');
  grupoFormato.className = 'subgrupo';
  const campoPrefijo = document.createElement('div');
  campoPrefijo.className = 'campo';
  const labelPrefijo = document.createElement('label');
  labelPrefijo.className = 'campo__etiqueta';
  labelPrefijo.textContent = 'Prefijo del precio';
  const inputPrefijo = document.createElement('input');
  inputPrefijo.type = 'text';
  inputPrefijo.maxLength = 6;
  inputPrefijo.value = formatoPrecio.prefijo;
  inputPrefijo.addEventListener('input', () => {
    formatoPrecio.prefijo = inputPrefijo.value;
    guardarFormatoDebounced();
  });
  campoPrefijo.append(labelPrefijo, inputPrefijo);

  const casilla = (etiqueta, clave) => {
    const div = document.createElement('label');
    div.className = 'fila';
    div.style.alignItems = 'center';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = !!formatoPrecio[clave];
    check.addEventListener('change', () => {
      formatoPrecio[clave] = check.checked;
      guardarFormatoDebounced();
    });
    const span = document.createElement('span');
    span.textContent = etiqueta;
    div.append(check, span);
    return div;
  };
  function guardarFormatoDebounced() {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      await repo.guardarFormatoPrecio(formatoPrecio);
      regenerarMiniaturas();
    }, 300);
  }
  grupoFormato.append(campoPrefijo, casilla('Separador de miles (es-AR)', 'separadorMiles'), casilla('Mostrar decimales', 'decimales'));

  seccionTexto.append(ayudaModelo, textareaModelo, previaModelo, grupoFormato);

  // --- 3) Tu plantilla: editor visual (posición, tipografía, color, fondo/etiqueta) ---
  const seccionPlantilla = seccion(
    'Tu plantilla',
    'Ajustá a mano dónde va el nombre, el precio y la descripción, con qué tipografía y color, y (si elegís "Mi plantilla") subí tu propio fondo.'
  );
  const enlacePlantilla = document.createElement('button');
  enlacePlantilla.type = 'button';
  enlacePlantilla.className = 'boton boton--primario boton--ancho';
  enlacePlantilla.setAttribute('data-accion', 'ir-plantilla');
  enlacePlantilla.textContent = 'Abrir editor de plantilla';
  enlacePlantilla.addEventListener('click', () => navegar('#/plantilla'));
  seccionPlantilla.append(enlacePlantilla);

  // --- 4) Datos: cuántos productos hay y adónde ir para respaldar/borrar ---
  const seccionDatos = seccion('Datos', 'Todo vive en este celular. Para exportar, importar o borrar todo, andá a Respaldo.');
  const resumenDatos = document.createElement('p');
  resumenDatos.className = 'texto-tenue';
  resumenDatos.textContent = `${productos.length} producto${productos.length === 1 ? '' : 's'} cargado${productos.length === 1 ? '' : 's'}.`;
  const btnRespaldo = document.createElement('button');
  btnRespaldo.type = 'button';
  btnRespaldo.className = 'boton boton--ancho';
  btnRespaldo.setAttribute('data-accion', 'ir-respaldo');
  btnRespaldo.textContent = 'Ir a Respaldo';
  btnRespaldo.addEventListener('click', () => navegar('#/respaldo'));
  seccionDatos.append(resumenDatos, btnRespaldo);

  wrap.append(seccionEstilo, seccionTexto, seccionPlantilla, seccionDatos, seccionLaApp());
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

function seccion(titulo, explicacion) {
  const div = document.createElement('div');
  div.className = 'grupo';
  const h = document.createElement('div');
  h.className = 'grupo__titulo';
  h.textContent = titulo;
  const p = document.createElement('p');
  p.className = 'grupo__explicacion';
  p.textContent = explicacion;
  div.append(h, p);
  return div;
}

/**
 * Tarjeta de un estilo: marco con placeholder "Generando…" (se reemplaza por el <img> recién
 * cuando hay `src`, nunca antes — así no se ve el ícono de imagen rota mientras se arma la
 * miniatura, BUGS.md ronda "miniaturas con placeholder") + etiqueta, y si `editable` un pie con
 * badge "Personalizado" (oculto hasta que corresponda) y botón "Editar".
 */
function tarjetaEstilo(valor, activa, { editable, onSeleccionar, onEditar }) {
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

function mostrarMiniatura(marco, url, alt) {
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
