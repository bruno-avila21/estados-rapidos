// Alta / edición de producto: foto (galería o cámara), nombre, precio, descripción.
// Reskin "Organic Minimalist" (Interfaz/stitch_.../editar_producto_natural): formulario partido en
// paneles temáticos (Fotografía / Información general / Descripción / Secciones), en vez de la
// pila plana anterior — misma lógica de guardado/validación, solo reorganizada en tarjetas.
import * as repo from '../repositorio.js';
import { validarProducto, parsearPrecio, formatearPrecio, ESTILOS_IMAGEN, ETIQUETA_ESTILO, validarNombreSeccion } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { crearIcono } from '../utils/iconos.js';
import { crearVistaPrevia } from '../utils/vista-previa-viva.js';
import { achicarFoto } from '../utils/imagen.js';

export async function render(contenedor, { navegar, params, protegerSalida }) {
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

  // Borrar producto: una sola función para las 2 entradas reales (el "Descartar" de la barra
  // superior y el "Borrar producto" del pie), mismo criterio que "2 botones, 1 acción" del mock.
  async function borrarProductoActual() {
    const ok = await pedirConfirmacion({
      titulo: 'Borrar producto',
      mensaje: `Se va a borrar "${producto.nombre}" y su foto. Esta acción no se puede deshacer.`,
    });
    if (!ok) return;
    await repo.borrarProducto(producto.id);
    protegerSalida?.(null); // ya no hay nada que perder: no preguntar al salir
    mostrarToast('Producto borrado');
    navegar('#/');
  }

  // --- Barra "Volver a Productos" / "Descartar": reemplaza al `.encabezado` compartido en esta
  // pantalla (headerOculto en main.js) — el mock no tiene marca/hamburguesa acá. ---
  const barraVolver = document.createElement('div');
  barraVolver.className = 'barra-volver barra-volver--producto';
  const btnVolverBarra = document.createElement('button');
  btnVolverBarra.type = 'button';
  btnVolverBarra.className = 'enlace-volver';
  btnVolverBarra.setAttribute('data-accion', 'volver-header');
  const etiquetaVolverBarra = document.createElement('span');
  etiquetaVolverBarra.textContent = 'Volver a Productos';
  btnVolverBarra.append(crearIcono('volver'), etiquetaVolverBarra);
  btnVolverBarra.addEventListener('click', () => navegar('#/'));
  // "Guardar" siempre a mano arriba (la barra es sticky): el formulario es largo y el botón del pie
  // queda lejos (pedido 2026-10-07). Dispara el mismo submit que el de abajo.
  const accionesBarra = document.createElement('div');
  accionesBarra.className = 'barra-volver__acciones';
  const btnGuardarBarra = document.createElement('button');
  btnGuardarBarra.type = 'button';
  btnGuardarBarra.className = 'boton boton--primario boton--chico barra-volver__guardar';
  btnGuardarBarra.setAttribute('data-accion', 'guardar-header');
  btnGuardarBarra.append(crearIcono('check'), document.createTextNode('Guardar'));
  btnGuardarBarra.addEventListener('click', () => form.requestSubmit());
  barraVolver.append(btnVolverBarra, accionesBarra);
  if (!esNuevo) {
    const btnDescartarBarra = document.createElement('button');
    btnDescartarBarra.type = 'button';
    btnDescartarBarra.className = 'barra-volver__descartar';
    btnDescartarBarra.setAttribute('data-accion', 'descartar-header');
    const etiquetaDescartar = document.createElement('span');
    etiquetaDescartar.textContent = 'Descartar';
    btnDescartarBarra.append(crearIcono('borrar'), etiquetaDescartar);
    btnDescartarBarra.addEventListener('click', borrarProductoActual);
    accionesBarra.append(btnDescartarBarra);
  }
  accionesBarra.append(btnGuardarBarra);

  // --- H1 real de la pantalla (vive en el contenido: patrones.md regla 3, "un H1 por pantalla" —
  // el header compartido ya no es <h1>). ---
  const cabeceraPagina = document.createElement('div');
  cabeceraPagina.className = 'pagina__cabecera';
  const textosCabecera = document.createElement('div');
  const h1Pagina = document.createElement('h1');
  h1Pagina.className = 'pagina__titulo';
  h1Pagina.textContent = esNuevo ? 'Agregar Producto' : 'Editar Producto';
  const subtituloPagina = document.createElement('p');
  subtituloPagina.className = 'pagina__subtitulo';
  subtituloPagina.textContent = 'Detalles y contenido del estado';
  textosCabecera.append(h1Pagina, subtituloPagina);
  cabeceraPagina.append(textosCabecera);

  const form = document.createElement('form');
  form.className = 'pila';
  form.noValidate = true;

  // --- Panel 1: fotografía (lo que se usa siempre) ---
  const panelFoto = document.createElement('section');
  panelFoto.className = 'panel foto-picker';
  const cabeceraFoto = document.createElement('div');
  cabeceraFoto.className = 'panel__cabecera';
  cabeceraFoto.style.marginBottom = '10px';
  const rotuloFoto = document.createElement('span');
  rotuloFoto.className = 'panel__rotulo';
  rotuloFoto.style.marginBottom = '0';
  rotuloFoto.textContent = 'Fotografía principal';
  const badgeAspecto = document.createElement('span');
  badgeAspecto.className = 'panel__badge';
  badgeAspecto.textContent = 'Vertical 9:16'; // 1080×1920 real (CLAUDE.md), no "1:1" del mock
  cabeceraFoto.append(rotuloFoto, badgeAspecto);
  panelFoto.append(cabeceraFoto);

  // Con foto se muestra la VISTA PREVIA del estado (9:16 entera, tal cual sale, y al tocarla se
  // abre a pantalla completa) en vez del recorte cuadrado de la foto (pedido 2026-10-07); el marco
  // con la cámara queda solo para cuando todavía no hay foto.
  const marcoFoto = document.createElement('div');
  marcoFoto.className = 'foto-picker__marco';
  const previaVacia = document.createElement('div');
  previaVacia.className = 'foto-picker__vista foto-picker__vista--vacia';
  previaVacia.setAttribute('aria-hidden', 'true');
  previaVacia.append(crearIcono('camara'));
  marcoFoto.append(previaVacia);
  marcoFoto.hidden = !!fotoBlobActual;

  // Lo que hay cargado en el formulario AHORA, como lo espera `componerVista`.
  function opcionesDeVista() {
    const textoPrecio = campoPrecio.input.value.trim();
    return {
      producto: {
        nombre: campoNombre.input.value.trim() || 'Nombre del producto',
        precio: textoPrecio ? parsearPrecio(textoPrecio) : null,
        descripcion: textareaDescripcion.value,
        estilo: selectEstiloOverride.value || null,
        secciones: [...seccionesSeleccionadas],
      },
      fotoBlob: archivoFotoNuevo || fotoBlobActual,
    };
  }
  const vistaPrevia = crearVistaPrevia({ obtenerOpciones: opcionesDeVista, accion: 'ver-completa' });
  vistaPrevia.raiz.hidden = !fotoBlobActual;

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

  // La foto se achica UNA vez, acá, y ese JPEG es lo que usan la vista previa y el guardado: releer
  // el archivo original más tarde es lo que fallaba en el teléfono (BUGS.md #73).
  const alElegirFoto = (input) => async (ev) => {
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    btnGuardar.disabled = true;
    btnGuardarBarra.disabled = true;
    try {
      archivoFotoNuevo = await achicarFoto(archivo);
    } catch {
      mostrarToast('No se pudo leer esa foto. Probá con otra o sacala de nuevo.');
      return;
    } finally {
      btnGuardar.disabled = false;
      btnGuardarBarra.disabled = false;
      input.value = ''; // deja volver a elegir el mismo archivo
    }
    marcoFoto.hidden = true;
    vistaPrevia.raiz.hidden = false;
    vistaPrevia.actualizar({ inmediato: true });
  };
  inputGaleria.addEventListener('change', alElegirFoto(inputGaleria));
  inputCamara.addEventListener('change', alElegirFoto(inputCamara));

  const accionesFoto = document.createElement('div');
  accionesFoto.className = 'foto-picker__acciones';
  const btnCamara = botonFoto({ icono: 'camara', texto: 'Cámara', accion: 'elegir-camara' });
  btnCamara.addEventListener('click', () => inputCamara.click());
  const btnGaleria = botonFoto({ icono: 'galeria', texto: 'Galería', accion: 'elegir-galeria' });
  btnGaleria.addEventListener('click', () => inputGaleria.click());
  accionesFoto.append(btnCamara, btnGaleria);

  panelFoto.append(marcoFoto, vistaPrevia.raiz, accionesFoto, inputGaleria, inputCamara);
  if (esNuevo) {
    // Varias fotos de una vez → pantalla "Agregar varios" (un producto por foto).
    const btnVarias = document.createElement('button');
    btnVarias.type = 'button';
    btnVarias.className = 'boton boton--fantasma boton--ancho foto-picker__varias';
    btnVarias.setAttribute('data-accion', 'ir-agregar-varios');
    btnVarias.append(crearIcono('galeria'), document.createTextNode('¿Son varios? Agregar varias fotos de una vez'));
    btnVarias.addEventListener('click', () => navegar('#/varias'));
    panelFoto.append(btnVarias);
  }

  // --- Panel 2: información general (nombre + precio) ---
  const panelInfo = document.createElement('section');
  panelInfo.className = 'panel';
  const tituloInfo = document.createElement('h2');
  tituloInfo.className = 'panel__titulo';
  tituloInfo.textContent = 'Información general';
  panelInfo.append(tituloInfo);

  const campoNombre = campoTexto({
    id: 'nombre',
    etiqueta: 'Nombre del producto',
    valor: producto?.nombre ?? '',
    tipo: 'text',
  });

  const campoPrecio = campoTexto({
    id: 'precio',
    etiqueta: 'Precio de catálogo',
    valor: producto?.precio != null ? String(producto.precio) : '',
    tipo: 'text',
    inputMode: 'decimal',
    prefijo: '$',
    etiquetaExtra: 'Opcional',
    ariaDescripcion: 'Dejalo vacío para publicar el estado sin precio visible.',
  });

  panelInfo.append(campoNombre.contenedor, campoPrecio.contenedor);

  // --- Panel 3: descripción / leyenda al publicar (con copiar al portapapeles) ---
  const panelDescripcion = document.createElement('section');
  panelDescripcion.className = 'panel';
  const cabeceraDescripcion = document.createElement('div');
  cabeceraDescripcion.className = 'panel__cabecera';
  const rotuloDescripcion = document.createElement('span');
  rotuloDescripcion.className = 'panel__rotulo';
  rotuloDescripcion.append(crearIcono('lista'), document.createTextNode('Descripción / leyenda al publicar'));
  const btnCopiarDescripcion = document.createElement('button');
  btnCopiarDescripcion.type = 'button';
  btnCopiarDescripcion.className = 'panel__accion-texto';
  btnCopiarDescripcion.setAttribute('data-accion', 'copiar-descripcion');
  btnCopiarDescripcion.append(crearIcono('copiar'), document.createTextNode('Copiar'));
  cabeceraDescripcion.append(rotuloDescripcion, btnCopiarDescripcion);

  const campoDescripcion = document.createElement('div');
  campoDescripcion.className = 'campo';
  const textareaDescripcion = document.createElement('textarea');
  textareaDescripcion.id = 'campo-descripcion';
  textareaDescripcion.maxLength = 300;
  textareaDescripcion.value = producto?.descripcion ?? '';
  campoDescripcion.append(textareaDescripcion);

  const pieDescripcion = document.createElement('div');
  pieDescripcion.className = 'panel__pie';
  const notaDescripcion = document.createElement('span');
  notaDescripcion.className = 'texto-tenue';
  notaDescripcion.textContent = 'Se puede editar al publicar; "Copiar" la deja lista para pegar en WhatsApp.';
  const contadorDescripcion = document.createElement('span');
  contadorDescripcion.className = 'panel__badge';
  const pintarContador = () => {
    const largo = textareaDescripcion.value.length;
    contadorDescripcion.textContent = `${largo} caracter${largo === 1 ? '' : 'es'}`;
  };
  pintarContador();
  textareaDescripcion.addEventListener('input', pintarContador);
  textareaDescripcion.addEventListener('input', () => vistaPrevia.actualizar());
  pieDescripcion.append(notaDescripcion, contadorDescripcion);

  btnCopiarDescripcion.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(textareaDescripcion.value);
      mostrarToast('Descripción copiada');
    } catch {
      mostrarToast('No se pudo copiar');
    }
  });

  panelDescripcion.append(cabeceraDescripcion, campoDescripcion, pieDescripcion);

  // La vista previa (panel de foto) se rearma sola mientras se escribe.
  campoNombre.input.addEventListener('input', () => vistaPrevia.actualizar());
  campoPrecio.input.addEventListener('input', () => vistaPrevia.actualizar());

  // --- Secciones (etiquetas): un producto puede estar en varias a la vez (ronda "secciones",
  // CREAR-BRIEF.md) — chips seleccionables + alta inline sin salir del formulario. ---
  const panelSecciones = document.createElement('section');
  panelSecciones.className = 'panel';
  const tituloSecciones = document.createElement('h2');
  tituloSecciones.className = 'panel__titulo';
  tituloSecciones.textContent = 'Secciones asignadas';
  const subtituloSecciones = document.createElement('p');
  subtituloSecciones.className = 'panel__subtitulo';
  subtituloSecciones.textContent = 'Elegí en qué secciones aparece este producto al filtrar o publicar.';
  const chipsSecciones = document.createElement('div');
  chipsSecciones.className = 'chips-secciones';

  const btnMostrarNuevaSeccion = document.createElement('button');
  btnMostrarNuevaSeccion.type = 'button';
  btnMostrarNuevaSeccion.className = 'chip chip--agregar';
  btnMostrarNuevaSeccion.setAttribute('data-accion', 'mostrar-nueva-seccion');
  btnMostrarNuevaSeccion.append(crearIcono('agregar'), document.createTextNode('Nueva sección'));

  function pintarChipsSecciones() {
    chipsSecciones.textContent = '';
    if (seccionesDisponibles.length === 0) {
      const vacio = document.createElement('p');
      vacio.className = 'texto-tenue';
      vacio.textContent = 'Todavía no creaste ninguna: agregá una con el botón de abajo.';
      chipsSecciones.append(vacio);
    } else {
      for (const seccion of seccionesDisponibles) {
        const chip = document.createElement('button');
        chip.type = 'button';
        const activa = seccionesSeleccionadas.has(seccion.id);
        chip.className = 'chip' + (activa ? ' chip--activo' : '');
        chip.setAttribute('data-accion', 'toggle-seccion');
        chip.setAttribute('data-id', seccion.id);
        chip.setAttribute('aria-pressed', String(activa));
        if (activa) chip.append(crearIcono('check'));
        chip.append(document.createTextNode(seccion.nombre));
        chip.addEventListener('click', () => {
          if (seccionesSeleccionadas.has(seccion.id)) seccionesSeleccionadas.delete(seccion.id);
          else seccionesSeleccionadas.add(seccion.id);
          pintarChipsSecciones();
          vistaPrevia.actualizar({ inmediato: true }); // varios estilos dibujan la sección
        });
        chipsSecciones.append(chip);
      }
    }
    chipsSecciones.append(btnMostrarNuevaSeccion);
  }
  pintarChipsSecciones();

  const formNuevaSeccion = document.createElement('form');
  formNuevaSeccion.className = 'fila chips-secciones__form';
  formNuevaSeccion.hidden = true;
  const inputNuevaSeccion = document.createElement('input');
  inputNuevaSeccion.type = 'text';
  inputNuevaSeccion.maxLength = 40;
  inputNuevaSeccion.placeholder = 'Nueva sección';
  inputNuevaSeccion.setAttribute('aria-label', 'Nombre de la nueva sección');
  const btnNuevaSeccion = document.createElement('button');
  btnNuevaSeccion.type = 'submit';
  btnNuevaSeccion.className = 'boton boton--chico';
  btnNuevaSeccion.setAttribute('data-accion', 'nueva-seccion');
  btnNuevaSeccion.textContent = 'Agregar';
  formNuevaSeccion.append(inputNuevaSeccion, btnNuevaSeccion);

  btnMostrarNuevaSeccion.addEventListener('click', () => {
    formNuevaSeccion.hidden = false;
    inputNuevaSeccion.focus();
  });

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
    vistaPrevia.actualizar({ inmediato: true });
  });

  panelSecciones.append(tituloSecciones, subtituloSecciones, chipsSecciones, formNuevaSeccion);

  // --- Opciones avanzadas: detrás de un gesto explícito (patrones.md, regla 9) — sin equivalente
  // en el diseño Stitch (que no modela el override de estilo por producto): se mantiene con el
  // mismo patrón `details.grupo` del resto de la app. ---
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
  selectEstiloOverride.addEventListener('change', () => vistaPrevia.actualizar({ inmediato: true }));
  vistaPrevia.actualizar({ inmediato: true });

  // Cambios sin guardar: se compara el formulario contra cómo estaba al abrirlo. Mientras difiera,
  // main.js pregunta antes de dejar salir de la pantalla (guardia de salida).
  const fotoDelFormulario = () =>
    JSON.stringify([
      campoNombre.input.value,
      campoPrecio.input.value,
      textareaDescripcion.value,
      selectEstiloOverride.value,
      [...seccionesSeleccionadas].sort(),
    ]);
  const formularioInicial = fotoDelFormulario();
  protegerSalida?.(() => !!archivoFotoNuevo || fotoDelFormulario() !== formularioInicial, guardar);

  const errorGeneral = document.createElement('div');
  errorGeneral.setAttribute('role', 'alert');
  errorGeneral.hidden = true;

  const filaAcciones = document.createElement('div');
  filaAcciones.className = 'fila formulario-producto__acciones';
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
  btnGuardar.append(crearIcono('check'), document.createTextNode(esNuevo ? 'Agregar producto' : 'Guardar cambios'));

  filaAcciones.append(btnCancelar, btnGuardar);

  form.append(panelFoto, panelInfo, panelDescripcion, panelSecciones, detallesAvanzado, errorGeneral, filaAcciones);

  if (!esNuevo) {
    const separador = document.createElement('div');
    separador.className = 'separador';
    const btnBorrar = document.createElement('button');
    btnBorrar.type = 'button';
    btnBorrar.className = 'boton boton--peligro boton--ancho';
    btnBorrar.setAttribute('data-accion', 'borrar');
    btnBorrar.append(crearIcono('borrar'), document.createTextNode('Borrar producto'));
    btnBorrar.addEventListener('click', borrarProductoActual);
    form.append(separador, btnBorrar);
  }

  /** Valida y guarda lo cargado. Devuelve si se guardó (lo usan el submit y "Guardar y salir" de la
   * guardia de salida, que navega por su cuenta). */
  async function guardar() {
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
      (errores.nombre ? campoNombre : campoPrecio).contenedor.scrollIntoView({ block: 'center' });
      return false;
    }
    btnGuardar.disabled = true;
    btnGuardarBarra.disabled = true;
    try {
      await repo.guardarProducto(datos, archivoFotoNuevo, { fotoYaAchicada: true });
      mostrarToast(esNuevo ? 'Producto agregado' : 'Cambios guardados');
      return true;
    } catch (error) {
      errorGeneral.hidden = false;
      errorGeneral.textContent = 'No se pudo guardar: ' + error.message;
      errorGeneral.scrollIntoView({ block: 'center' });
      return false;
    } finally {
      btnGuardar.disabled = false;
      btnGuardarBarra.disabled = false;
    }
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (!(await guardar())) return;
    protegerSalida?.(null); // guardado: salir ya no pierde nada
    navegar('#/');
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

  contenedor.append(barraVolver, cabeceraPagina, form);
}

function botonFoto({ icono, texto, accion }) {
  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'foto-picker__accion';
  boton.setAttribute('data-accion', accion);
  const etiqueta = document.createElement('span');
  etiqueta.textContent = texto;
  boton.append(crearIcono(icono), etiqueta);
  return boton;
}

function campoTexto({ id, etiqueta, valor, tipo, inputMode, ariaDescripcion, prefijo, etiquetaExtra }) {
  const contenedor = document.createElement('div');
  contenedor.className = 'campo';
  const filaEtiqueta = document.createElement('div');
  filaEtiqueta.className = 'campo__fila-etiqueta';
  const label = document.createElement('label');
  label.className = 'campo__etiqueta';
  label.htmlFor = `campo-${id}`;
  label.textContent = etiqueta;
  filaEtiqueta.append(label);
  if (etiquetaExtra) {
    const extra = document.createElement('span');
    extra.className = 'texto-tenue';
    extra.textContent = etiquetaExtra;
    filaEtiqueta.append(extra);
  }

  const envoltorioInput = document.createElement('div');
  envoltorioInput.className = prefijo ? 'campo__envoltorio campo__envoltorio--prefijo' : 'campo__envoltorio';
  if (prefijo) {
    const spanPrefijo = document.createElement('span');
    spanPrefijo.className = 'campo__prefijo';
    spanPrefijo.setAttribute('aria-hidden', 'true');
    spanPrefijo.textContent = prefijo;
    envoltorioInput.append(spanPrefijo);
  }
  const input = document.createElement('input');
  input.type = tipo;
  input.id = `campo-${id}`;
  input.value = valor;
  if (inputMode) input.inputMode = inputMode;
  envoltorioInput.append(input);

  const error = document.createElement('div');
  error.className = 'campo__error';
  error.setAttribute('role', 'alert'); // se anuncia a lectores de pantalla (QA.md #7)
  error.hidden = true;
  contenedor.append(filaEtiqueta, envoltorioInput);
  if (ariaDescripcion) {
    const ayuda = document.createElement('div');
    ayuda.className = 'texto-tenue';
    ayuda.textContent = ariaDescripcion;
    contenedor.append(ayuda);
  }
  contenedor.append(error);
  return { contenedor, input, error };
}
