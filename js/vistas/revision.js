// Hoja de revisión: antes de compartir (1 o N productos), arma las imágenes en secuencia con
// progreso, deja editar la descripción y elegir el estilo, y comparte todo junto (o de a uno si
// el navegador no soporta compartir varios archivos), con descarga como último recurso.
// CREAR-BRIEF.md, cambio de producto 2026-09-27.
import * as repo from '../repositorio.js';
import { componerSegunEstilo } from '../componer.js';
import { resolverEstilo, resolverDescripcion, ESTILOS_IMAGEN } from '../modelo.js';
import { compartirArchivos, copiarDescripcion, descargarImagen, puedeCompartirArchivos } from '../utils/compartir.js';
import { mostrarToast } from '../utils/toast.js';

export const LIMITE_IMAGENES = 30;

const ETIQUETA_ESTILO = {
  'solo-foto': 'Solo la foto',
  'foto-precio': 'Foto con precio',
  'mi-plantilla': 'Mi plantilla',
};

export async function abrirHojaRevision({ ids }) {
  if (!ids?.length) return;

  const idsLimitados = ids.slice(0, LIMITE_IMAGENES);
  if (ids.length > LIMITE_IMAGENES) {
    mostrarToast(`Whatsapp acepta hasta ${LIMITE_IMAGENES} por vez: se arman las primeras ${LIMITE_IMAGENES}.`);
  }

  const productos = [];
  for (const id of idsLimitados) {
    const producto = await repo.obtenerProducto(id);
    if (producto) productos.push(producto);
  }
  if (!productos.length) return;

  const general = await repo.obtenerAjustesGenerales();
  const plantillaConfig = await repo.obtenerPlantillaConfig();
  let estiloSesion = null; // si se elige acá, se usa para TODAS las imágenes de esta hoja
  let imagenes = []; // [{ producto, blob, url }]

  // --- Overlay y estructura ---
  const overlay = document.createElement('div');
  overlay.className = 'dialogo-overlay';
  const caja = document.createElement('div');
  caja.className = 'dialogo hoja-revision';
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  caja.setAttribute('aria-label', 'Revisar antes de publicar');

  const titulo = document.createElement('h2');
  titulo.className = 'dialogo__titulo';
  titulo.textContent = productos.length === 1 ? 'Revisar antes de publicar' : `Revisar ${productos.length} productos`;

  const progreso = document.createElement('p');
  progreso.className = 'texto-tenue';
  progreso.setAttribute('role', 'status');

  const carrusel = document.createElement('div');
  carrusel.className = 'hoja-revision__carrusel';

  const campoEstilo = document.createElement('div');
  campoEstilo.className = 'campo';
  const labelEstilo = document.createElement('label');
  labelEstilo.className = 'campo__etiqueta';
  labelEstilo.htmlFor = 'revision-estilo';
  labelEstilo.textContent = 'Estilo para esta tanda';
  const selectEstilo = document.createElement('select');
  selectEstilo.id = 'revision-estilo';
  selectEstilo.setAttribute('data-accion', 'revision-estilo');
  const opcionAuto = document.createElement('option');
  opcionAuto.value = '';
  opcionAuto.textContent = 'El de cada producto';
  selectEstilo.append(opcionAuto);
  for (const valor of ESTILOS_IMAGEN) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = ETIQUETA_ESTILO[valor];
    selectEstilo.append(opcion);
  }
  campoEstilo.append(labelEstilo, selectEstilo);

  const campoDescripcion = document.createElement('div');
  campoDescripcion.className = 'campo';
  const labelDescripcion = document.createElement('label');
  labelDescripcion.className = 'campo__etiqueta';
  labelDescripcion.htmlFor = 'revision-descripcion';
  labelDescripcion.textContent =
    productos.length === 1 ? 'Descripción' : 'Descripción (una por línea, se comparte como un solo texto)';
  const textareaDescripcion = document.createElement('textarea');
  textareaDescripcion.id = 'revision-descripcion';
  textareaDescripcion.value = productos.map((p) => resolverDescripcion(p, { ...general, formatoPrecio: plantillaConfig.formatoPrecio })).join('\n');
  campoDescripcion.append(labelDescripcion, textareaDescripcion);

  const acciones = document.createElement('div');
  acciones.className = 'dialogo__acciones';
  const btnCerrar = document.createElement('button');
  btnCerrar.type = 'button';
  btnCerrar.className = 'boton boton--fantasma';
  btnCerrar.setAttribute('data-accion', 'revision-cerrar');
  btnCerrar.textContent = 'Cerrar';
  const btnCompartir = document.createElement('button');
  btnCompartir.type = 'button';
  btnCompartir.className = 'boton boton--primario';
  btnCompartir.setAttribute('data-accion', 'revision-compartir');
  btnCompartir.textContent = 'Compartir';
  acciones.append(btnCerrar, btnCompartir);

  caja.append(titulo, progreso, carrusel, campoEstilo, campoDescripcion, acciones);
  overlay.append(caja);
  document.body.append(overlay);

  const alEscape = (ev) => {
    if (ev.key === 'Escape') cerrar();
  };
  document.addEventListener('keydown', alEscape);
  overlay.addEventListener('click', (ev) => {
    if (ev.target === overlay) cerrar();
  });
  btnCerrar.addEventListener('click', cerrar);

  function cerrar() {
    document.removeEventListener('keydown', alEscape);
    imagenes.forEach((im) => im.url && URL.revokeObjectURL(im.url));
    overlay.remove();
  }

  async function generarImagenProducto(producto) {
    const estilo = estiloSesion || resolverEstilo(producto, general);
    const fotoBlob = await repo.obtenerFotoBlob(producto.fotoId);
    const fotoImagen = fotoBlob ? await createImageBitmap(fotoBlob) : null;
    let plantillaImagen = null;
    if (estilo === 'mi-plantilla') {
      plantillaImagen = await createImageBitmap(await repo.obtenerImagenPlantillaBlob());
    }
    const descripcion = resolverDescripcion(producto, { ...general, formatoPrecio: plantillaConfig.formatoPrecio });
    return await componerSegunEstilo({
      estilo,
      plantillaImagen,
      fotoImagen,
      producto,
      ajustes: plantillaConfig.ajustes,
      formatoPrecio: plantillaConfig.formatoPrecio,
      descripcion,
    });
  }

  async function generarTodas() {
    imagenes.forEach((im) => im.url && URL.revokeObjectURL(im.url));
    imagenes = [];
    carrusel.textContent = '';
    btnCompartir.disabled = true;
    for (let i = 0; i < productos.length; i += 1) {
      progreso.textContent = `Armando ${i + 1}/${productos.length}`;
      // eslint-disable-next-line no-await-in-loop -- secuencial a propósito: no congela la UI
      const blob = await generarImagenProducto(productos[i]);
      const url = URL.createObjectURL(blob);
      imagenes.push({ producto: productos[i], blob, url });
      const img = document.createElement('img');
      img.className = 'hoja-revision__miniatura';
      img.src = url;
      img.alt = productos[i].nombre;
      carrusel.append(img);
    }
    progreso.textContent = '';
    btnCompartir.disabled = false;
  }

  selectEstilo.addEventListener('change', async () => {
    estiloSesion = selectEstilo.value || null;
    await generarTodas();
  });

  btnCompartir.addEventListener('click', () => compartirOFallback());

  async function compartirOFallback() {
    btnCompartir.disabled = true;
    const texto = textareaDescripcion.value;
    await copiarDescripcion(texto);
    const archivos = imagenes.map(
      (im, i) => new File([im.blob], `estado-${i + 1}.png`, { type: 'image/png' })
    );

    if (puedeCompartirArchivos(archivos)) {
      const resultado = await compartirArchivos({ archivos, texto });
      btnCompartir.disabled = false;
      if (resultado === 'compartido') {
        mostrarToast('¡Listo! Elegí "Mi estado" en WhatsApp');
        cerrar();
      }
      // cancelado/tardando/error ya avisaron por toast dentro de compartirArchivos; se deja
      // la hoja abierta para que se pueda reintentar sin rearmar todo de nuevo.
      return;
    }

    if (puedeCompartirArchivos([archivos[0]])) {
      await compartirDeAUno(archivos, texto);
      return;
    }

    imagenes.forEach((im, i) => descargarImagen(im.blob, `estado-${i + 1}.png`));
    mostrarToast(
      imagenes.length > 1
        ? 'Tu navegador no comparte varios archivos juntos: se descargaron todas'
        : 'Tu navegador no comparte archivos: se descargó la imagen'
    );
    btnCompartir.disabled = false;
    cerrar();
  }

  async function compartirDeAUno(archivos, texto) {
    let i = 0;
    const compartirActual = async () => {
      btnCompartir.disabled = true;
      const resultado = await compartirArchivos({ archivos: [archivos[i]], texto });
      btnCompartir.disabled = false;
      if (resultado !== 'compartido') return; // el toast ya avisó qué pasó; no se avanza solo
      i += 1;
      if (i >= archivos.length) {
        mostrarToast('Listo, se compartieron todas');
        cerrar();
        return;
      }
      btnCompartir.textContent = `Siguiente (${i + 1}/${archivos.length})`;
    };
    btnCompartir.textContent = `Compartir (1/${archivos.length})`;
    btnCompartir.onclick = compartirActual;
    await compartirActual();
  }

  await generarTodas();
}
