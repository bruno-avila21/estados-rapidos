// Pantalla "Plantilla": subir PNG 1080x1920, ajustar caja de foto y textos, formato de precio,
// con vista previa en vivo (usa la misma función de composición real, sin duplicar lógica).
import * as repo from '../repositorio.js';
import { componerImagen, ANCHO, ALTO } from '../componer.js';
import { mostrarToast } from '../utils/toast.js';

let debounce = null;

export async function render(contenedor) {
  contenedor.textContent = '';

  const config = await repo.obtenerPlantillaConfig();
  const ajustes = estructuraClonada(config.ajustes);
  const formatoPrecio = { ...config.formatoPrecio };

  const productos = await repo.listarProductos();
  const productoEjemplo = productos[0] || { nombre: 'Producto de ejemplo', precio: 12345 };
  const fotoEjemplo = productos[0]?.fotoId ? await repo.obtenerFotoBlob(productos[0].fotoId) : null;

  const wrap = document.createElement('div');
  wrap.className = 'pila';

  // --- Capa 1: la imagen y qué se ve ---
  const previa = document.createElement('img');
  previa.className = 'previa-plantilla';
  previa.alt = 'Vista previa del estado con la plantilla actual';
  wrap.append(previa);

  const subida = document.createElement('div');
  subida.className = 'grupo';
  const tituloSubida = document.createElement('div');
  tituloSubida.className = 'grupo__titulo';
  tituloSubida.textContent = 'Imagen de fondo (PNG 1080×1920)';
  const inputPlantilla = document.createElement('input');
  inputPlantilla.type = 'file';
  inputPlantilla.accept = 'image/png';
  inputPlantilla.className = 'campo-oculto';
  inputPlantilla.tabIndex = -1; // el disparo lo hace el botón visible (QA.md #7)
  inputPlantilla.setAttribute('data-accion-input', 'subir-plantilla');
  const btnSubir = document.createElement('button');
  btnSubir.type = 'button';
  btnSubir.className = 'boton';
  btnSubir.setAttribute('data-accion', 'subir-plantilla');
  btnSubir.textContent = 'Elegir imagen…';
  btnSubir.addEventListener('click', () => inputPlantilla.click());
  inputPlantilla.addEventListener('change', async (ev) => {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    await repo.guardarImagenPlantilla(archivo);
    mostrarToast('Plantilla actualizada');
    actualizarPrevia();
  });
  subida.append(tituloSubida, btnSubir, inputPlantilla);
  wrap.append(subida);

  // --- Capa 2: ajustes agrupados con título ---
  wrap.append(
    grupoCaja('Foto del producto', ajustes.foto, [
      { clave: 'x', etiqueta: 'Posición horizontal', min: 0, max: ANCHO },
      { clave: 'y', etiqueta: 'Posición vertical', min: 0, max: ALTO },
      { clave: 'w', etiqueta: 'Ancho', min: 40, max: ANCHO },
      { clave: 'h', etiqueta: 'Alto', min: 40, max: ALTO },
    ])
  );

  wrap.append(grupoTexto('Nombre', ajustes.nombre));
  wrap.append(grupoTexto('Precio', ajustes.precio));
  wrap.append(grupoFormatoPrecio(formatoPrecio));

  contenedor.append(wrap);
  actualizarPrevia();

  function estructuraClonada(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function grupoCaja(titulo, caja, campos) {
    const grupo = document.createElement('div');
    grupo.className = 'grupo';
    const h = document.createElement('div');
    h.className = 'grupo__titulo';
    h.textContent = titulo;
    grupo.append(h);
    for (const campo of campos) {
      grupo.append(deslizador({ etiqueta: campo.etiqueta, valor: caja[campo.clave], min: campo.min, max: campo.max, onCambio: (v) => { caja[campo.clave] = v; guardarAjustesDebounced(); } }));
    }
    return grupo;
  }

  function grupoTexto(titulo, caja) {
    const grupo = document.createElement('div');
    grupo.className = 'grupo';
    const h = document.createElement('div');
    h.className = 'grupo__titulo';
    h.textContent = titulo;
    grupo.append(h);
    grupo.append(deslizador({ etiqueta: 'Posición horizontal', valor: caja.x, min: 0, max: ANCHO, onCambio: (v) => { caja.x = v; guardarAjustesDebounced(); } }));
    grupo.append(deslizador({ etiqueta: 'Posición vertical', valor: caja.y, min: 0, max: ALTO, onCambio: (v) => { caja.y = v; guardarAjustesDebounced(); } }));
    grupo.append(deslizador({ etiqueta: 'Ancho de la caja', valor: caja.w, min: 100, max: ANCHO, onCambio: (v) => { caja.w = v; guardarAjustesDebounced(); } }));
    grupo.append(deslizador({ etiqueta: 'Tamaño de letra', valor: caja.tamano, min: 20, max: 160, onCambio: (v) => { caja.tamano = v; guardarAjustesDebounced(); } }));

    const campoColor = document.createElement('div');
    campoColor.className = 'campo';
    const label = document.createElement('label');
    label.className = 'campo__etiqueta';
    label.textContent = 'Color';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = caja.color;
    input.addEventListener('input', () => {
      caja.color = input.value;
      guardarAjustesDebounced();
    });
    campoColor.append(label, input);
    grupo.append(campoColor);

    return grupo;
  }

  function grupoFormatoPrecio() {
    const grupo = document.createElement('div');
    grupo.className = 'grupo';
    const h = document.createElement('div');
    h.className = 'grupo__titulo';
    h.textContent = 'Formato del precio';
    grupo.append(h);

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

    grupo.append(campoPrefijo, casilla('Separador de miles (es-AR)', 'separadorMiles'), casilla('Mostrar decimales', 'decimales'));
    return grupo;
  }

  function deslizador({ etiqueta, valor, min, max, onCambio }) {
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
    const valorSpan = document.createElement('span');
    valorSpan.className = 'deslizador__valor';
    valorSpan.textContent = String(valor);
    input.addEventListener('input', () => {
      const v = Number(input.value);
      valorSpan.textContent = String(v);
      onCambio(v);
      actualizarPrevia();
    });
    fila.append(input, valorSpan);
    div.append(label, fila);
    return div;
  }

  function guardarAjustesDebounced() {
    clearTimeout(debounce);
    debounce = setTimeout(() => repo.guardarAjustesPlantilla(ajustes), 300);
  }
  function guardarFormatoDebounced() {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      await repo.guardarFormatoPrecio(formatoPrecio);
      actualizarPrevia();
    }, 300);
  }

  async function actualizarPrevia() {
    try {
      const plantillaBlob = await repo.obtenerImagenPlantillaBlob();
      const plantillaImagen = await createImageBitmap(plantillaBlob);
      const fotoImagen = fotoEjemplo ? await createImageBitmap(fotoEjemplo) : null;
      const blob = await componerImagen({
        plantillaImagen,
        fotoImagen,
        producto: productoEjemplo,
        ajustes,
        formatoPrecio,
      });
      const url = URL.createObjectURL(blob);
      const anterior = previa.src;
      previa.src = url;
      if (anterior && anterior.startsWith('blob:')) URL.revokeObjectURL(anterior);
    } catch (error) {
      mostrarToast('No se pudo actualizar la vista previa: ' + error.message);
    }
  }
}
