// Capa de datos: une db.js (IndexedDB) con el modelo. Único punto que conoce los "stores".
import * as db from './db.js';
import {
  AJUSTES_POR_DEFECTO_POR_ESTILO,
  FORMATO_PRECIO_POR_DEFECTO,
  ESTILO_POR_DEFECTO,
  DESCRIPCION_MODELO_POR_DEFECTO,
  ENCUADRE_FOTO_POR_DEFECTO,
  construirRespaldo,
  migrarAjustesPorEstilo,
  normalizarAjustesPorEstilo,
  generarId,
} from './modelo.js';
import { achicarFoto, blobABase64, base64ABlob } from './utils/imagen.js';
import { generarPlantillaPorDefecto } from './plantilla-defecto.js';

export async function listarProductos() {
  const productos = await db.obtenerTodos('productos');
  return productos.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

export async function obtenerProducto(id) {
  return await db.obtener('productos', id);
}

export async function guardarProducto(datos, archivoFoto) {
  const existente = datos.id ? await db.obtener('productos', datos.id) : null;
  const id = datos.id || generarId();
  let fotoId = existente?.fotoId ?? null;

  if (archivoFoto) {
    const blobChico = await achicarFoto(archivoFoto);
    fotoId = fotoId || `foto_${id}`;
    await db.guardar('blobs', { id: fotoId, blob: blobChico });
  }

  const ahora = new Date().toISOString();
  const producto = {
    id,
    nombre: datos.nombre.trim(),
    precio: datos.precio,
    descripcion: (datos.descripcion || '').trim(),
    fotoId,
    // 'estilo' in datos: "null" explícito significa "usar el general" y tiene que limpiar un
    // override previo, así que NO puede caer al `existente?.estilo` con `??` (null es nullish).
    estilo: 'estilo' in datos ? datos.estilo : (existente?.estilo ?? null),
    // los productos nuevos arrancan marcados: lo más común es querer publicarlos (CREAR-BRIEF.md).
    seleccionado: existente?.seleccionado ?? true,
    orden: existente?.orden ?? (await siguienteOrden()),
    creado: existente?.creado ?? ahora,
    actualizado: ahora,
  };
  await db.guardar('productos', producto);
  return producto;
}

/** Marca/desmarca un producto para la selección múltiple persistente (CREAR-BRIEF.md 2026-09-27). */
export async function actualizarSeleccion(id, seleccionado) {
  const producto = await db.obtener('productos', id);
  if (!producto) return null;
  producto.seleccionado = !!seleccionado;
  await db.guardar('productos', producto);
  return producto;
}

/** Marca o desmarca TODOS los productos de una vez ("Marcar todos" / "Desmarcar"). */
export async function marcarTodos(seleccionado) {
  const productos = await listarProductos();
  for (const producto of productos) {
    producto.seleccionado = !!seleccionado;
    await db.guardar('productos', producto);
  }
  return productos;
}

async function siguienteOrden() {
  const productos = await listarProductos();
  return productos.length ? Math.max(...productos.map((p) => p.orden ?? 0)) + 1 : 0;
}

/** Borra TODO (productos, fotos y plantilla). Irreversible: quien llama ya pidió confirmación. */
export async function borrarTodo() {
  await db.vaciar('productos');
  await db.vaciar('blobs');
  await db.vaciar('config');
}

export async function actualizarPrecio(id, precio) {
  const producto = await db.obtener('productos', id);
  if (!producto) return null;
  producto.precio = precio;
  producto.actualizado = new Date().toISOString();
  await db.guardar('productos', producto);
  return producto;
}

export async function borrarProducto(id) {
  const producto = await db.obtener('productos', id);
  if (producto?.fotoId) await db.borrar('blobs', producto.fotoId).catch(() => {});
  await db.borrar('productos', id);
}

export async function obtenerFotoBlob(fotoId) {
  if (!fotoId) return null;
  const registro = await db.obtener('blobs', fotoId);
  return registro?.blob ?? null;
}

export async function obtenerPlantillaConfig() {
  const guardada = await db.obtener('config', 'plantilla');
  return {
    id: 'plantilla',
    imagenId: guardada?.imagenId ?? null,
    ajustesPorEstilo: migrarAjustesPorEstilo(guardada),
    formatoPrecio: guardada?.formatoPrecio ?? FORMATO_PRECIO_POR_DEFECTO,
  };
}

export async function obtenerImagenPlantillaBlob() {
  const config = await obtenerPlantillaConfig();
  if (config.imagenId) {
    const registro = await db.obtener('blobs', config.imagenId);
    if (registro?.blob) return registro.blob;
  }
  return await generarPlantillaPorDefecto();
}

export async function guardarImagenPlantilla(archivo) {
  const config = await obtenerPlantillaConfig();
  const id = 'plantilla_img';
  await db.guardar('blobs', { id, blob: archivo });
  config.imagenId = id;
  await db.guardar('config', config);
  return config;
}

/** Guarda los ajustes de UN estilo (posición/tipografía/color/fondo/visibilidad): cada estilo se
 * edita y persiste por separado (ronda "ajustes por estilo", 2026-09-28). */
export async function guardarAjustesEstilo(estilo, ajustes) {
  const config = await obtenerPlantillaConfig();
  config.ajustesPorEstilo = { ...config.ajustesPorEstilo, [estilo]: ajustes };
  await db.guardar('config', config);
  return config;
}

/** "Volver al original de este estilo": restablece SOLO el estilo indicado a sus defaults de
 * fábrica, sin tocar los otros 2. */
export async function restablecerAjustesEstilo(estilo) {
  const defaults = AJUSTES_POR_DEFECTO_POR_ESTILO[estilo];
  if (!defaults) return null;
  return await guardarAjustesEstilo(estilo, JSON.parse(JSON.stringify(defaults)));
}

export async function guardarFormatoPrecio(formatoPrecio) {
  const config = await obtenerPlantillaConfig();
  config.formatoPrecio = formatoPrecio;
  await db.guardar('config', config);
  return config;
}

// --- Ajustes generales: estilo de imagen por defecto y modelo de descripción ---
export async function obtenerAjustesGenerales() {
  const guardado = await db.obtener('config', 'general');
  // Se completa con `encuadreFoto` (agregado en la ronda de distribución) por si el registro
  // guardado es de antes de que existiera ese campo — igual que `normalizarAjustes` con la
  // plantilla, un respaldo/uso viejo sigue andando con el valor por defecto.
  const base = {
    id: 'general',
    estiloGeneral: ESTILO_POR_DEFECTO,
    descripcionModelo: DESCRIPCION_MODELO_POR_DEFECTO,
    encuadreFoto: ENCUADRE_FOTO_POR_DEFECTO,
    // "Incluir texto" de la hoja de revisión (ronda "compartir sin texto", 2026-09-28): se recuerda
    // la última elección; por defecto encendido (copiar/mandar el texto es lo de siempre).
    incluirTextoAlCompartir: true,
  };
  return guardado ? { ...base, ...guardado } : base;
}

export async function guardarEstiloGeneral(estiloGeneral) {
  const config = await obtenerAjustesGenerales();
  config.estiloGeneral = estiloGeneral;
  await db.guardar('config', config);
  return config;
}

export async function guardarDescripcionModelo(descripcionModelo) {
  const config = await obtenerAjustesGenerales();
  config.descripcionModelo = descripcionModelo;
  await db.guardar('config', config);
  return config;
}

/** "Encuadre de la foto" general (Entera/contain por defecto, o Llenar la pantalla/cover). */
export async function guardarEncuadreFoto(encuadreFoto) {
  const config = await obtenerAjustesGenerales();
  config.encuadreFoto = encuadreFoto;
  await db.guardar('config', config);
  return config;
}

/** "Incluir texto" de la hoja de revisión: se recuerda la última elección (ronda "compartir sin
 * texto"). */
export async function guardarIncluirTextoAlCompartir(incluirTextoAlCompartir) {
  const config = await obtenerAjustesGenerales();
  config.incluirTextoAlCompartir = !!incluirTextoAlCompartir;
  await db.guardar('config', config);
  return config;
}

export async function exportarRespaldo() {
  const productos = await listarProductos();
  const productosConFoto = await Promise.all(
    productos.map(async (p) => ({
      ...p,
      fotoBase64: p.fotoId ? await blobABase64(await obtenerFotoBlob(p.fotoId)) : null,
    }))
  );
  const config = await obtenerPlantillaConfig();
  const imagenBase64 = config.imagenId
    ? await blobABase64((await db.obtener('blobs', config.imagenId)).blob)
    : null;
  const general = await obtenerAjustesGenerales();

  return construirRespaldo({
    productos: productosConFoto,
    plantilla: { imagenBase64, ajustesPorEstilo: config.ajustesPorEstilo, formatoPrecio: config.formatoPrecio },
    general: {
      estiloGeneral: general.estiloGeneral,
      descripcionModelo: general.descripcionModelo,
      encuadreFoto: general.encuadreFoto,
      incluirTextoAlCompartir: general.incluirTextoAlCompartir,
    },
  });
}

/** Reemplaza TODOS los datos por los del respaldo (ya validado con validarRespaldo). */
export async function importarRespaldo(respaldo) {
  await db.vaciar('productos');
  await db.vaciar('blobs');
  await db.vaciar('config');

  for (const [i, p] of respaldo.productos.entries()) {
    let fotoId = null;
    if (p.fotoBase64) {
      fotoId = `foto_${p.id}`;
      await db.guardar('blobs', { id: fotoId, blob: await base64ABlob(p.fotoBase64) });
    }
    await db.guardar('productos', {
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      descripcion: p.descripcion ?? '',
      fotoId,
      estilo: p.estilo ?? null,
      seleccionado: p.seleccionado ?? true,
      orden: i,
      creado: p.creado ?? new Date().toISOString(),
      actualizado: p.actualizado ?? new Date().toISOString(),
    });
  }

  if (respaldo.plantilla) {
    let imagenId = null;
    if (respaldo.plantilla.imagenBase64) {
      imagenId = 'plantilla_img';
      await db.guardar('blobs', { id: imagenId, blob: await base64ABlob(respaldo.plantilla.imagenBase64) });
    }
    await db.guardar('config', {
      id: 'plantilla',
      imagenId,
      // migrarAjustesPorEstilo acepta tanto el formato nuevo (ajustesPorEstilo) como el viejo
      // (ajustes compartido, de un respaldo de antes de 2026-09-28): en ambos casos se conserva
      // lo que el usuario ya armó (CREAR-BRIEF.md, ronda "ajustes por estilo").
      ajustesPorEstilo: migrarAjustesPorEstilo({
        ajustesPorEstilo: respaldo.plantilla.ajustesPorEstilo,
        ajustes: respaldo.plantilla.ajustes,
      }),
      formatoPrecio: respaldo.plantilla.formatoPrecio || FORMATO_PRECIO_POR_DEFECTO,
    });
  }

  // respaldos viejos (antes de 2026-09-27, o de antes de los campos `encuadreFoto`/
  // `incluirTextoAlCompartir`) no tienen "general" completo: quedan los valores por defecto.
  await db.guardar('config', {
    id: 'general',
    estiloGeneral: respaldo.general?.estiloGeneral || ESTILO_POR_DEFECTO,
    descripcionModelo: respaldo.general?.descripcionModelo || DESCRIPCION_MODELO_POR_DEFECTO,
    encuadreFoto: respaldo.general?.encuadreFoto || ENCUADRE_FOTO_POR_DEFECTO,
    incluirTextoAlCompartir: respaldo.general?.incluirTextoAlCompartir ?? true,
  });
}
