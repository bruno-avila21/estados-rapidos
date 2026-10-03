// Arma el estado 1080×1920 de UN producto tal cual saldría al publicar (mismo `componerSegunEstilo`
// y mismos datos que la hoja de revisión), para mostrarlo entero en el visor desde Ajustes y desde
// el alta/edición — sin pasar por "Publicar".
import * as repo from '../repositorio.js';
import { componerSegunEstilo } from '../componer.js';
import { resolverEstilo, resolverDescripcion, resolverSeccionNombre } from '../modelo.js';
import { fotoDeEjemploPorDefecto } from './foto-ejemplo.js';

const PRODUCTO_DE_EJEMPLO = { nombre: 'Producto de ejemplo', precio: 12500, descripcion: '' };

/**
 * @param {{ producto?: object|null, fotoBlob?: Blob|null }} [opciones] sin `producto` usa el primero
 *   cargado (o el de ejemplo, con la foto de ejemplo del proyecto) — igual que el editor de plantilla.
 * @returns {Promise<Blob>}
 */
export async function componerVistaCompleta({ producto = null, fotoBlob = null } = {}) {
  const [general, plantillaConfig, secciones] = await Promise.all([
    repo.obtenerAjustesGenerales(),
    repo.obtenerPlantillaConfig(),
    repo.listarSecciones(),
  ]);

  let productoFinal = producto;
  let blobFoto = fotoBlob;
  if (!productoFinal) {
    const primero = (await repo.listarProductos())[0];
    productoFinal = primero || PRODUCTO_DE_EJEMPLO;
    blobFoto = primero?.fotoId ? await repo.obtenerFotoBlob(primero.fotoId) : null;
  }
  const fotoImagen = blobFoto ? await createImageBitmap(blobFoto) : await fotoDeEjemploPorDefecto();

  const estilo = resolverEstilo(productoFinal, general);
  const plantillaImagen =
    estilo === 'mi-plantilla' ? await createImageBitmap(await repo.obtenerImagenPlantillaBlob()) : null;

  return componerSegunEstilo({
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
  });
}
