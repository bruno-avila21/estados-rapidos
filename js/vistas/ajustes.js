// Pantalla "Ajustes": 4 secciones con título + explicación (estilo de imagen con tarjetas de
// miniatura en vivo, texto que acompaña, tu plantilla, datos). CREAR-BRIEF.md, ronda 2026-09-27.
import * as repo from '../repositorio.js';
import { ESTILOS_IMAGEN, ETIQUETA_ESTILO, aplicarPlantillaDescripcion, resolverDescripcion } from '../modelo.js';
import { componerSegunEstilo } from '../componer.js';
import { mostrarToast } from '../utils/toast.js';

let debounce = null;
let urlsMiniaturas = [];

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
    const { tarjeta, img } = tarjetaEstilo(valor, general.estiloGeneral === valor, async () => {
      await repo.guardarEstiloGeneral(valor);
      general.estiloGeneral = valor;
      for (const v of ESTILOS_IMAGEN) tarjetasPorEstilo[v].classList.toggle('tarjeta-estilo--activa', v === valor);
      mostrarToast(`Estilo general: ${ETIQUETA_ESTILO[valor]}`);
    });
    tarjetasPorEstilo[valor] = tarjeta;
    tarjeta.dataset.imgRef = valor;
    grillaEstilos.append(tarjeta);
  }
  seccionEstilo.append(grillaEstilos);

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

  wrap.append(seccionEstilo, seccionTexto, seccionPlantilla, seccionDatos);
  contenedor.append(wrap);

  async function regenerarMiniaturas() {
    const config = await repo.obtenerPlantillaConfig();
    // siempre se busca: la tarjeta "Mi plantilla" necesita su miniatura aunque no sea el estilo activo.
    const plantillaBlob = await repo.obtenerImagenPlantillaBlob();
    const plantillaImagen = await createImageBitmap(plantillaBlob);
    const fotoImagen = fotoEjemploBlob ? await createImageBitmap(fotoEjemploBlob) : null;
    const descripcionResuelta = resolverDescripcion(productoEjemplo, { ...general, formatoPrecio: config.formatoPrecio });

    for (const valor of ESTILOS_IMAGEN) {
      try {
        const blob = await componerSegunEstilo({
          estilo: valor,
          plantillaImagen,
          fotoImagen,
          producto: productoEjemplo,
          ajustes: config.ajustes,
          formatoPrecio: config.formatoPrecio,
          descripcion: descripcionResuelta,
        });
        const url = URL.createObjectURL(blob);
        urlsMiniaturas.push(url);
        const img = tarjetasPorEstilo[valor].querySelector('img');
        img.src = url;
      } catch {
        // una miniatura que falla no rompe el resto de la pantalla
      }
    }
  }

  await regenerarMiniaturas();
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

function tarjetaEstilo(valor, activa, onSeleccionar) {
  const tarjeta = document.createElement('button');
  tarjeta.type = 'button';
  tarjeta.className = 'tarjeta-estilo' + (activa ? ' tarjeta-estilo--activa' : '');
  tarjeta.setAttribute('data-accion', `estilo-${valor}`);
  tarjeta.setAttribute('aria-pressed', String(activa));

  const img = document.createElement('img');
  img.className = 'tarjeta-estilo__miniatura';
  img.alt = `Vista previa del estilo ${ETIQUETA_ESTILO[valor]}`;

  const etiqueta = document.createElement('span');
  etiqueta.className = 'tarjeta-estilo__etiqueta';
  etiqueta.textContent = ETIQUETA_ESTILO[valor];

  tarjeta.append(img, etiqueta);
  tarjeta.addEventListener('click', async () => {
    document.querySelectorAll('.tarjeta-estilo').forEach((t) => t.setAttribute('aria-pressed', 'false'));
    tarjeta.setAttribute('aria-pressed', 'true');
    await onSeleccionar();
  });
  return { tarjeta, img };
}

function limpiarUrls() {
  urlsMiniaturas.forEach((u) => URL.revokeObjectURL(u));
  urlsMiniaturas = [];
}
