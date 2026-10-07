// Arma el estado de UN producto tal cual saldría al publicar (mismo dibujo y mismos datos que la
// hoja de revisión), para mostrarlo desde Ajustes y desde el alta/edición sin pasar por "Publicar":
// entero a 1080×1920 en el visor ("Ver completa") o como miniatura de la vista previa en vivo.
import * as repo from '../repositorio.js';
import { componerSegunEstilo, componerMiniatura } from '../componer.js';
import { resolverEstilo, resolverDescripcion, resolverSeccionNombre } from '../modelo.js';
import { fotoDeEjemploPorDefecto } from './foto-ejemplo.js';

const PRODUCTO_DE_EJEMPLO = { nombre: 'Producto de ejemplo', precio: 12500, descripcion: '' };

// La vista previa en vivo se rearma en cada tecla: la foto se decodifica UNA vez por archivo.
const bitmapsPorBlob = new WeakMap();
function bitmapDe(blob) {
  if (!bitmapsPorBlob.has(blob)) bitmapsPorBlob.set(blob, createImageBitmap(blob));
  return bitmapsPorBlob.get(blob);
}

/**
 * @param {object} [opciones]
 * @param {object|null} [opciones.producto] sin producto usa el primero cargado (o el de ejemplo, con
 *   la foto de ejemplo del proyecto) — igual que el editor de plantilla.
 * @param {Blob|null} [opciones.fotoBlob]
 * @param {object} [opciones.general] ajustes generales todavía sin guardar que pisan a los guardados
 *   (ej. la plantilla de descripción mientras se la está escribiendo en Ajustes).
 * @param {boolean} [opciones.soloModelo] ignora la descripción propia del producto: muestra lo que
 *   sale de la plantilla de descripción de Ajustes.
 * @param {boolean} [opciones.miniatura] 540×960 liviana en vez del archivo 1080×1920.
 * @returns {Promise<Blob>}
 */
export async function componerVista({ producto = null, fotoBlob = null, general: generalExtra = null, soloModelo = false, miniatura = false } = {}) {
  const [generalGuardado, plantillaConfig, secciones] = await Promise.all([
    repo.obtenerAjustesGenerales(),
    repo.obtenerPlantillaConfig(),
    repo.listarSecciones(),
  ]);
  const general = { ...generalGuardado, ...generalExtra };

  let productoFinal = producto;
  let blobFoto = fotoBlob;
  if (!productoFinal) {
    const primero = (await repo.listarProductos())[0];
    productoFinal = primero || PRODUCTO_DE_EJEMPLO;
    blobFoto = primero?.fotoId ? await repo.obtenerFotoBlob(primero.fotoId) : null;
  }
  if (soloModelo) productoFinal = { ...productoFinal, descripcion: '' };
  const fotoImagen = blobFoto ? await bitmapDe(blobFoto) : await fotoDeEjemploPorDefecto();

  const estilo = resolverEstilo(productoFinal, general);
  const plantillaImagen = estilo === 'mi-plantilla' ? await bitmapDe(await repo.obtenerImagenPlantillaBlob()) : null;

  const datos = {
    estilo,
    plantillaImagen,
    fotoImagen,
    producto: productoFinal,
    ajustes: plantillaConfig.ajustesPorEstilo?.[estilo] ?? {},
    formatoPrecio: plantillaConfig.formatoPrecio,
    descripcion: resolverDescripcion(productoFinal, { ...general, formatoPrecio: plantillaConfig.formatoPrecio }),
    encuadreFoto: general.encuadreFoto,
    general,
    seccionNombre: resolverSeccionNombre(productoFinal, secciones),
    posicion: { n: 1, m: 1 },
  };
  return miniatura ? componerMiniatura(datos, { ancho: 540, alto: 960 }) : componerSegunEstilo(datos);
}

/** El estado entero a 1080×1920 (para el visor "Ver completa"). */
export function componerVistaCompleta(opciones = {}) {
  return componerVista({ ...opciones, miniatura: false });
}
