// Alta / edición de producto: foto (galería o cámara), nombre, precio, descripción.
import * as repo from '../repositorio.js';
import { validarProducto, parsearPrecio, formatearPrecio, ESTILOS_IMAGEN, ETIQUETA_ESTILO, validarNombreSeccion } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';

export async function render(contenedor, { navegar, params }) {
  contenedor.textContent = '';
  const esNuevo = !params.id || params.id === 'nuevo';
  const producto = esNuevo ? null : await repo.obtenerProducto(params.id);
  let seccionesDisponibles = await repo.listarSecciones();
  const seccionesSeleccionadas = new Set(producto?.secciones ?? []);

  if (!esNuevo && !producto) {
    const alerta = document.createElement('div');
    alerta.setAttribute('role', 'alert');
    alerta.textContent = 'Ese producto ya no existe.';
    contenedor.append(alerta);
    return;
  }

  let archivoFotoNuevo = null;
  const fotoBlobActual = producto?.fotoId ? await repo.obtenerFotoBlob(producto.fotoId) : null;
  let urlPreviaActual = fotoBlobActual ? URL.createObjectURL(fotoBlobActual) : null;

  const form = document.createElement('form');
  form.className = 'pila';
  form.noValidate = true;

  // --- Capa 1: foto + nombre + precio (lo que se usa siempre) ---
  const grupoFoto = document.createElement('div');
  grupoFoto.className = 'foto-picker';
  const previa = document.createElement('img');
  previa.className = 'foto-picker__vista';
  previa.alt = '';
  if (urlPreviaActual) previa.src = urlPreviaActual;
  previa.hidden = !urlPreviaActual;

  const previaVacia = document.createElement('div');
  previaVacia.className = 'foto-picker__vista tarjeta__foto--vacia';
  previaVacia.textContent = '📷';
  previaVacia.hidden = !!urlPreviaActual;

  const inputGaleria = document.createElement('input');
  inputGaleria.type = 'file';
  inputGaleria.accept = 'image/*';
  inputGaleria.className = 'campo-oculto';
  inputGaleria.tabIndex = -1; // el disparo lo hace el botón visible (QA.md #7)
  inputGaleria.setAttribute('data-accion-input', 'elegir-galeria');

  const inputCamara = document.createElement('input');
  inputCamara.type = 'file';
  inputCamara.accept = 'image/*';
  inputCamara.capture = 'environment';
  inputCamara.className = 'campo-oculto';
  inputCamara.tabIndex = -1; // el disparo lo hace el botón visible (QA.md #7)
  inputCamara.setAttribute('data-accion-input', 'elegir-camara');

  const alElegirFoto = (input) => (ev) => {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    archivoFotoNuevo = archivo;
    if (urlPreviaActual) URL.revokeObjectURL(urlPreviaActual);
    urlPreviaActual = URL.createObjectURL(archivo);
    previa.src = urlPreviaActual;
    previa.hidden = false;
    previaVacia.hidden = true;
  };
  inputGaleria.addEventListener('change', alElegirFoto(inputGaleria));
  inputCamara.addEventListener('change', alElegirFoto(inputCamara));

  const botonesFoto = document.createElement('div');
  botonesFoto.className = 'pila';
  const btnGaleria = document.createElement('button');
  btnGaleria.type = 'button';
  btnGaleria.className = 'boton boton--chico';
  btnGaleria.setAttribute('data-accion', 'elegir-galeria');
  btnGaleria.textContent = 'Galería';
  btnGaleria.addEventListener('click', () => inputGaleria.click());
  const btnCamara = document.createElement('button');
  btnCamara.type = 'button';
  btnCamara.className = 'boton boton--chico';
  btnCamara.setAttribute('data-accion', 'elegir-camara');
  btnCamara.textContent = 'Cámara';
  btnCamara.addEventListener('click', () => inputCamara.click());
  botonesFoto.append(btnGaleria, btnCamara);

  grupoFoto.append(previa, previaVacia, botonesFoto, inputGaleria, inputCamara);

  const campoNombre = campoTexto({
    id: 'nombre',
    etiqueta: 'Nombre',
    valor: producto?.nombre ?? '',
    tipo: 'text',
  });

  const campoPrecio = campoTexto({
    id: 'precio',
    etiqueta: 'Precio',
    valor: producto?.precio != null ? String(producto.precio) : '',
    tipo: 'text',
    inputMode: 'decimal',
    ariaDescripcion: 'Opcional: dejalo vacío para publicar sin precio.',
  });

  // --- Capa 2: descripción (agrupada, para la leyenda del estado) ---
  const grupoDescripcion = document.createElement('div');
  grupoDescripcion.className = 'grupo';
  const tituloDescripcion = document.createElement('div');
  tituloDescripcion.className = 'grupo__titulo';
  tituloDescripcion.textContent = 'Descripción (leyenda al publicar)';
  const campoDescripcion = document.createElement('div');
  campoDescripcion.className = 'campo';
  const textareaDescripcion = document.createElement('textarea');
  textareaDescripcion.id = 'campo-descripcion';
  textareaDescripcion.maxLength = 300;
  textareaDescripcion.value = producto?.descripcion ?? '';
  campoDescripcion.append(textareaDescripcion);
  grupoDescripcion.append(tituloDescripcion, campoDescripcion);

  // --- Secciones (etiquetas): un producto puede estar en varias a la vez (ronda "secciones",
  // CREAR-BRIEF.md) — chips seleccionables + alta inline sin salir del formulario. ---
  const grupoSecciones = document.createElement('div');
  grupoSecciones.className = 'grupo';
  const tituloSecciones = document.createElement('div');
  tituloSecciones.className = 'grupo__titulo';
  tituloSecciones.textContent = 'Secciones';
  const chipsSecciones = document.createElement('div');
  chipsSecciones.className = 'chips-secciones';

  function pintarChipsSecciones() {
    chipsSecciones.textContent = '';
    if (seccionesDisponibles.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'texto-tenue';
      vacio.textContent = 'Todavía no creaste ninguna: agregá una acá abajo.';
      chipsSecciones.append(vacio);
      return;
    }
    for (const seccion of seccionesDisponibles) {
      const chip = document.createElement('button');
      chip.type = 'button';
      const activa = seccionesSeleccionadas.has(seccion.id);
      chip.className = 'chip' + (activa ? ' chip--activo' : '');
      chip.setAttribute('data-accion', 'toggle-seccion');
      chip.setAttribute('data-id', seccion.id);
      chip.setAttribute('aria-pressed', String(activa));
      chip.textContent = seccion.nombre;
      chip.addEventListener('click', () => {
        if (seccionesSeleccionadas.has(seccion.id)) seccionesSeleccionadas.delete(seccion.id);
        else seccionesSeleccionadas.add(seccion.id);
        pintarChipsSecciones();
      });
      chipsSecciones.append(chip);
    }
  }
  pintarChipsSecciones();

  const formNuevaSeccion = document.createElement('form');
  formNuevaSeccion.className = 'fila';
  const inputNuevaSeccion = document.createElement('input');
  inputNuevaSeccion.type = 'text';
  inputNuevaSeccion.maxLength = 40;
  inputNuevaSeccion.placeholder = 'Nueva sección';
  inputNuevaSeccion.setAttribute('aria-label', 'Nombre de la nueva sección');
  const btnNuevaSeccion = document.createElement('button');
  btnNuevaSeccion.type = 'submit';
  btnNuevaSeccion.className = 'boton boton--chico';
  btnNuevaSeccion.setAttribute('data-accion', 'nueva-seccion');
  btnNuevaSeccion.textContent = '+ Nueva sección';
  formNuevaSeccion.append(inputNuevaSeccion, btnNuevaSeccion);
  formNuevaSeccion.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { ok, error } = validarNombreSeccion(inputNuevaSeccion.value);
    if (!ok) {
      mostrarToast(error);
      return;
    }
    const nueva = await repo.crearSeccion(inputNuevaSeccion.value);
    seccionesDisponibles = await repo.listarSecciones();
    seccionesSeleccionadas.add(nueva.id);
    inputNuevaSeccion.value = '';
    pintarChipsSecciones();
  });

  grupoSecciones.append(tituloSecciones, chipsSecciones, formNuevaSeccion);

  // --- Capa 3: opciones avanzadas, detrás de un gesto explícito (patrones.md, regla 9) ---
  const detallesAvanzado = document.createElement('details');
  detallesAvanzado.className = 'grupo';
  const resumenAvanzado = document.createElement('summary');
  resumenAvanzado.className = 'grupo__titulo';
  resumenAvanzado.textContent = producto?.estilo
    ? `Opciones avanzadas · estilo: ${ETIQUETA_ESTILO[producto.estilo]}`
    : 'Opciones avanzadas';
  const campoEstiloOverride = document.createElement('div');
  campoEstiloOverride.className = 'campo';
  const labelEstiloOverride = document.createElement('label');
  labelEstiloOverride.className = 'campo__etiqueta';
  labelEstiloOverride.htmlFor = 'campo-estilo-override';
  labelEstiloOverride.textContent = 'Estilo de imagen para este producto';
  const selectEstiloOverride = document.createElement('select');
  selectEstiloOverride.id = 'campo-estilo-override';
  const opcionGeneral = document.createElement('option');
  opcionGeneral.value = '';
  opcionGeneral.textContent = 'Usar el estilo general (Ajustes)';
  selectEstiloOverride.append(opcionGeneral);
  for (const valor of ESTILOS_IMAGEN) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = ETIQUETA_ESTILO[valor];
    selectEstiloOverride.append(opcion);
  }
  selectEstiloOverride.value = producto?.estilo || '';
  campoEstiloOverride.append(labelEstiloOverride, selectEstiloOverride);
  detallesAvanzado.append(resumenAvanzado, campoEstiloOverride);

  const errorGeneral = document.createElement('div');
  errorGeneral.setAttribute('role', 'alert');
  errorGeneral.hidden = true;

  const filaAcciones = document.createElement('div');
  filaAcciones.className = 'fila';
  const btnCancelar = document.createElement('button');
  btnCancelar.type = 'button';
  btnCancelar.className = 'boton boton--fantasma';
  btnCancelar.setAttribute('data-accion', 'cancelar');
  btnCancelar.textContent = 'Cancelar';
  btnCancelar.addEventListener('click', () => navegar('#/'));

  const btnGuardar = document.createElement('button');
  btnGuardar.type = 'submit';
  btnGuardar.className = 'boton boton--primario boton--ancho';
  btnGuardar.setAttribute('data-accion', 'guardar');
  btnGuardar.textContent = esNuevo ? 'Agregar producto' : 'Guardar cambios';

  filaAcciones.append(btnCancelar, btnGuardar);

  form.append(grupoFoto, campoNombre.contenedor, campoPrecio.contenedor, grupoDescripcion, grupoSecciones, detallesAvanzado, errorGeneral, filaAcciones);

  if (!esNuevo) {
    const separador = document.createElement('div');
    separador.className = 'separador';
    const btnBorrar = document.createElement('button');
    btnBorrar.type = 'button';
    btnBorrar.className = 'boton boton--peligro boton--ancho';
    btnBorrar.setAttribute('data-accion', 'borrar');
    btnBorrar.textContent = 'Borrar producto';
    btnBorrar.addEventListener('click', async () => {
      const ok = await pedirConfirmacion({
        titulo: 'Borrar producto',
        mensaje: `Se va a borrar "${producto.nombre}" y su foto. Esta acción no se puede deshacer.`,
      });
      if (!ok) return;
      await repo.borrarProducto(producto.id);
      mostrarToast('Producto borrado');
      navegar('#/');
    });
    form.append(separador, btnBorrar);
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    errorGeneral.hidden = true;
    const textoPrecio = campoPrecio.input.value.trim();
    const datos = {
      id: producto?.id,
      nombre: campoNombre.input.value,
      // vacío = sin precio (null, válido); si escribió algo, se parsea y validarProducto exige > 0.
      precio: textoPrecio ? parsearPrecio(textoPrecio) : null,
      descripcion: textareaDescripcion.value,
      estilo: selectEstiloOverride.value || null,
      secciones: [...seccionesSeleccionadas],
    };
    const { ok, errores } = validarProducto(datos);
    limpiarErrores();
    if (!ok) {
      mostrarErrores(errores, { nombre: campoNombre, precio: campoPrecio });
      return;
    }
    btnGuardar.disabled = true;
    try {
      await repo.guardarProducto(datos, archivoFotoNuevo);
      mostrarToast(esNuevo ? 'Producto agregado' : 'Cambios guardados');
      navegar('#/');
    } catch (error) {
      errorGeneral.hidden = false;
      errorGeneral.textContent = 'No se pudo guardar: ' + error.message;
    } finally {
      btnGuardar.disabled = false;
    }
  });

  function limpiarErrores() {
    campoNombre.error.hidden = true;
    campoPrecio.error.hidden = true;
  }
  function mostrarErrores(errores) {
    if (errores.nombre) {
      campoNombre.error.textContent = errores.nombre;
      campoNombre.error.hidden = false;
    }
    if (errores.precio) {
      campoPrecio.error.textContent = errores.precio;
      campoPrecio.error.hidden = false;
    }
  }

  contenedor.append(form);
}

function campoTexto({ id, etiqueta, valor, tipo, inputMode, ariaDescripcion }) {
  const contenedor = document.createElement('div');
  contenedor.className = 'campo';
  const label = document.createElement('label');
  label.className = 'campo__etiqueta';
  label.htmlFor = `campo-${id}`;
  label.textContent = etiqueta;
  const input = document.createElement('input');
  input.type = tipo;
  input.id = `campo-${id}`;
  input.value = valor;
  if (inputMode) input.inputMode = inputMode;
  const error = document.createElement('div');
  error.className = 'campo__error';
  error.setAttribute('role', 'alert'); // se anuncia a lectores de pantalla (QA.md #7)
  error.hidden = true;
  if (ariaDescripcion) {
    const ayuda = document.createElement('div');
    ayuda.className = 'texto-tenue';
    ayuda.textContent = ariaDescripcion;
    contenedor.append(label, input, ayuda, error);
  } else {
    contenedor.append(label, input, error);
  }
  return { contenedor, input, error };
}
