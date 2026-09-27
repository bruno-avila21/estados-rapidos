// Pantalla "Ajustes": estilo de imagen general, descripción modelo y formato de precio.
// La pantalla "Plantilla" (plantilla.js) ya no está en la navegación principal: solo se abre
// desde acá cuando el estilo general es "Mi plantilla" (CREAR-BRIEF.md, cambio 2026-09-27).
import * as repo from '../repositorio.js';
import { ESTILOS_IMAGEN, aplicarPlantillaDescripcion } from '../modelo.js';
import { mostrarToast } from '../utils/toast.js';

const ETIQUETA_ESTILO = {
  'solo-foto': 'Solo la foto',
  'foto-precio': 'Foto con precio',
  'mi-plantilla': 'Mi plantilla',
};

let debounce = null;

export async function render(contenedor, { navegar }) {
  contenedor.textContent = '';

  const general = await repo.obtenerAjustesGenerales();
  const plantillaConfig = await repo.obtenerPlantillaConfig();
  const formatoPrecio = { ...plantillaConfig.formatoPrecio };

  const wrap = document.createElement('div');
  wrap.className = 'pila';

  // --- Capa 1: lo que se usa siempre ---
  const grupoEstilo = document.createElement('div');
  grupoEstilo.className = 'grupo';
  const tituloEstilo = document.createElement('div');
  tituloEstilo.className = 'grupo__titulo';
  tituloEstilo.textContent = 'Estilo de imagen (general)';
  grupoEstilo.append(tituloEstilo);

  const enlacePlantilla = document.createElement('button');
  enlacePlantilla.type = 'button';
  enlacePlantilla.className = 'boton boton--chico';
  enlacePlantilla.setAttribute('data-accion', 'ir-plantilla');
  enlacePlantilla.textContent = 'Configurar mi plantilla…';
  enlacePlantilla.hidden = general.estiloGeneral !== 'mi-plantilla';
  enlacePlantilla.addEventListener('click', () => navegar('#/plantilla'));

  for (const valor of ESTILOS_IMAGEN) {
    const label = document.createElement('label');
    label.className = 'fila';
    label.style.alignItems = 'center';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'estilo-general';
    radio.value = valor;
    radio.checked = general.estiloGeneral === valor;
    radio.setAttribute('data-accion', `estilo-${valor}`);
    radio.addEventListener('change', async () => {
      if (!radio.checked) return;
      await repo.guardarEstiloGeneral(valor);
      general.estiloGeneral = valor;
      enlacePlantilla.hidden = valor !== 'mi-plantilla';
      mostrarToast(`Estilo general: ${ETIQUETA_ESTILO[valor]}`);
    });
    const span = document.createElement('span');
    span.textContent = ETIQUETA_ESTILO[valor];
    label.append(radio, span);
    grupoEstilo.append(label);
  }
  grupoEstilo.append(enlacePlantilla);

  // --- Capa 2: descripción modelo, agrupada con título y ejemplo en vivo ---
  const grupoDescripcion = document.createElement('div');
  grupoDescripcion.className = 'grupo';
  const tituloDescripcion = document.createElement('div');
  tituloDescripcion.className = 'grupo__titulo';
  tituloDescripcion.textContent = 'Descripción modelo (se usa si el producto no tiene una propia)';
  const ayudaDescripcion = document.createElement('p');
  ayudaDescripcion.className = 'texto-tenue';
  ayudaDescripcion.textContent = 'Marcadores disponibles: {nombre} {precio} {descripcion}';
  const textareaModelo = document.createElement('textarea');
  textareaModelo.id = 'campo-descripcion-modelo';
  textareaModelo.maxLength = 300;
  textareaModelo.value = general.descripcionModelo;
  const previaModelo = document.createElement('p');
  previaModelo.className = 'texto-tenue';
  previaModelo.setAttribute('role', 'status');

  const actualizarPrevia = () => {
    previaModelo.textContent =
      'Ejemplo: ' +
      aplicarPlantillaDescripcion(textareaModelo.value, {
        nombre: 'Remera básica',
        precio: '$ 12.500',
        descripcion: '',
      });
  };
  actualizarPrevia();

  textareaModelo.addEventListener('input', () => {
    actualizarPrevia();
    clearTimeout(debounce);
    debounce = setTimeout(() => repo.guardarDescripcionModelo(textareaModelo.value), 300);
  });

  grupoDescripcion.append(tituloDescripcion, ayudaDescripcion, textareaModelo, previaModelo);

  // --- Capa 2: formato del precio ---
  const grupoFormato = document.createElement('div');
  grupoFormato.className = 'grupo';
  const tituloFormato = document.createElement('div');
  tituloFormato.className = 'grupo__titulo';
  tituloFormato.textContent = 'Formato del precio';
  grupoFormato.append(tituloFormato);

  const campoPrefijo = document.createElement('div');
  campoPrefijo.className = 'campo';
  const labelPrefijo = document.createElement('label');
  labelPrefijo.className = 'campo__etiqueta';
  labelPrefijo.textContent = 'Prefijo';
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
    debounce = setTimeout(() => repo.guardarFormatoPrecio(formatoPrecio), 300);
  }

  grupoFormato.append(campoPrefijo, casilla('Separador de miles (es-AR)', 'separadorMiles'), casilla('Mostrar decimales', 'decimales'));

  wrap.append(grupoEstilo, grupoDescripcion, grupoFormato);
  contenedor.append(wrap);
}
