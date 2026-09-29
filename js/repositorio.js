// Capa de datos: une db.js (IndexedDB) con el modelo. Único punto que conoce los "stores".
import * as db from './db.js';
import {
  AJUSTES_POR_DEFECTO_POR_ESTILO,
  FORMATO_PRECIO_POR_DEFECTO,
  ESTILO_POR_DEFECTO,
  DESCRIPCION_MODELO_POR_DEFECTO,
  ENCUADRE_FOTO_POR_DEFECTO,
  CALIDAD_IMAGEN_POR_DEFECTO,
  NOMBRE_NEGOCIO_POR_DEFECTO,
  TEXTO_BOTON_POR_DEFECTO,
  construirRespaldo,
  migrarAjustesPorEstilo,
  normalizarAjustesPorEstilo,
  generarId,
} from './modelo.js';
import { achicarFoto, blobABase64, base64ABlob } from './utils/imagen.js';
import { generarPlantillaPorDefecto } from './plantilla-defecto.js';

// Un producto guardado antes de la ronda "secciones" no tiene el campo `secciones`: se normaliza
// acá (única puerta de lectura) para que el resto de la app nunca vea `undefined`.
function normalizarProductoLeido(producto) {
  return { ...producto, secciones: Array.isArray(producto.secciones) ? producto.secciones : [] };
}

export async function listarProductos() {
  const productos = await db.obtenerTodos('productos');
  return productos.map(normalizarProductoLeido).sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

export async function obtenerProducto(id) {
  const producto = await db.obtener('productos', id);
  return producto ? normalizarProductoLeido(producto) : null;
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
    // 'secciones' in datos: igual criterio que 'estilo' — un array vacío explícito ("saqué todas
    // las secciones") tiene que pisar lo existente, no perderse con `??` (ronda "secciones").
    secciones: 'secciones' in datos ? [...new Set(datos.secciones || [])] : (existente?.secciones ?? []),
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

/** Marca o desmarca TODOS los productos de una vez ("Marcar todos" / "Desmarcar"). Con `idsFiltro`
 * (filtro de sección activo en la lista) marca solo esos — "Marcar todos" dentro de una sección
 * marca solo los de esa sección, ronda "secciones". */
export async function marcarTodos(seleccionado, idsFiltro) {
  const productos = await listarProductos();
  const objetivo = idsFiltro ? productos.filter((p) => idsFiltro.includes(p.id)) : productos;
  for (const producto of objetivo) {
    producto.seleccionado = !!seleccionado;
    await db.guardar('productos', producto);
  }
  return objetivo;
}

// --- Secciones: etiquetas (colección `secciones` + `producto.secciones: [ids]`, ronda "secciones") ---

export async function listarSecciones() {
  const secciones = await db.obtenerTodos('secciones');
  return secciones.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
}

export async function crearSeccion(nombre) {
  const secciones = await listarSecciones();
  const seccion = {
    id: generarId(),
    nombre: String(nombre || '').trim(),
    orden: secciones.length ? Math.max(...secciones.map((s) => s.orden ?? 0)) + 1 : 0,
  };
  await db.guardar('secciones', seccion);
  return seccion;
}

export async function renombrarSeccion(id, nombre) {
  const seccion = await db.obtener('secciones', id);
  if (!seccion) return null;
  seccion.nombre = String(nombre || '').trim();
  await db.guardar('secciones', seccion);
  return seccion;
}

/** Sube o baja una sección un lugar (sin drag obligatorio, CREAR-BRIEF.md): intercambia su `orden`
 * con el vecino inmediato. */
export async function reordenarSeccion(id, direccion) {
  const secciones = await listarSecciones();
  const i = secciones.findIndex((s) => s.id === id);
  if (i === -1) return secciones;
  const j = direccion === 'subir' ? i - 1 : i + 1;
  if (j < 0 || j >= secciones.length) return secciones;
  const a = secciones[i];
  const b = secciones[j];
  const ordenA = a.orden ?? 0;
  a.orden = b.orden ?? 0;
  b.orden = ordenA;
  await db.guardar('secciones', a);
  await db.guardar('secciones', b);
  return await listarSecciones();
}

/** Reordenamiento COMPLETO (arrastre con el dedo, reskin "gesti_n_de_secciones_natural"): recibe
 * los ids YA en el orden final y reasigna `orden` = índice para cada uno — mismo campo que
 * `reordenarSeccion`, pero de un saque, porque un drag puede soltar varias posiciones más allá del
 * vecino inmediato (que es lo único que `reordenarSeccion` sabe mover). Ids que no existan más se
 * ignoran (no rompe si la base y la lista en pantalla quedaron un instante desincronizadas). */
export async function reordenarSecciones(nuevoOrdenIds) {
  const secciones = await listarSecciones();
  const porId = new Map(secciones.map((s) => [s.id, s]));
  let indice = 0;
  for (const id of nuevoOrdenIds) {
    const seccion = porId.get(id);
    if (!seccion) continue;
    seccion.orden = indice;
    indice += 1;
    await db.guardar('secciones', seccion);
  }
  return await listarSecciones();
}

/** Borrar una sección NO borra productos: solo los desasigna (quita su id de `producto.secciones`).
 * La confirmación la pide quien llama (pantalla de gestión). */
export async function borrarSeccion(id) {
  await db.borrar('secciones', id);
  const productos = await listarProductos();
  for (const producto of productos) {
    if (producto.secciones.includes(id)) {
      producto.secciones = producto.secciones.filter((s) => s !== id);
      await db.guardar('productos', producto);
    }
  }
}

/** Asigna el juego completo de secciones de un producto (reemplaza, no suma). */
export async function asignarSecciones(productoId, secciones) {
  const producto = await db.obtener('productos', productoId);
  if (!producto) return null;
  producto.secciones = [...new Set(Array.isArray(secciones) ? secciones : [])];
  await db.guardar('productos', producto);
  return normalizarProductoLeido(producto);
}

// --- Preferencias de la lista de Productos: filtro de sección, vista compacta/grilla y qué grupos
// quedaron plegados — todo recordado entre visitas (ronda "secciones"). ---
export async function obtenerPreferenciasLista() {
  const guardado = await db.obtener('config', 'listaPrefs');
  return {
    id: 'listaPrefs',
    filtroSeccion: guardado?.filtroSeccion ?? 'todas',
    vista: guardado?.vista === 'grilla' ? 'grilla' : 'compacta',
    gruposPlegados: guardado?.gruposPlegados ?? {},
  };
}

export async function guardarPreferenciasLista(parcial) {
  const actual = await obtenerPreferenciasLista();
  const nuevo = { ...actual, ...parcial };
  await db.guardar('config', nuevo);
  return nuevo;
}

async function siguienteOrden() {
  const productos = await listarProductos();
  return productos.length ? Math.max(...productos.map((p) => p.orden ?? 0)) + 1 : 0;
}

/** Borra TODO (productos, fotos, plantilla y secciones). Irreversible: quien llama ya pidió confirmación. */
export async function borrarTodo() {
  await db.vaciar('productos');
  await db.vaciar('blobs');
  await db.vaciar('config');
  await db.vaciar('secciones');
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
    // Calidad de imagen al exportar (Fase 2, "S" #5): se recuerda la última elección de la hoja de
    // revisión; por defecto 'estandar' (mismo criterio que los campos de arriba: un registro de
    // antes de esta ronda no lo trae y queda con el valor por defecto).
    calidadImagen: CALIDAD_IMAGEN_POR_DEFECTO,
    // Copia automática diaria (ronda "copia automática", Respaldo → "Preferencias de respaldo"):
    // apagada por defecto — un respaldo/uso de antes de esta ronda no la trae y arranca sin
    // escribir nada solo hasta que la persona la prenda a propósito.
    copiaAutomaticaHabilitada: false,
    // Datos de marca de los 4 presets de composición (ronda 2026-09-29): un registro de antes de
    // esta ronda no los trae, quedan en sus defaults (nombre vacío = no se dibuja).
    nombreNegocio: NOMBRE_NEGOCIO_POR_DEFECTO,
    textoBoton: TEXTO_BOTON_POR_DEFECTO,
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

/** Calidad de imagen ('estandar'/'alta') elegida en la hoja de revisión: se recuerda entre hojas,
 * igual que "Incluir texto" (Fase 2, "S" #5). */
export async function guardarCalidadImagen(calidadImagen) {
  const config = await obtenerAjustesGenerales();
  config.calidadImagen = calidadImagen;
  await db.guardar('config', config);
  return config;
}

/** Interruptor "Copia automática diaria" de Respaldo → "Preferencias de respaldo". */
export async function guardarCopiaAutomaticaHabilitada(habilitada) {
  const config = await obtenerAjustesGenerales();
  config.copiaAutomaticaHabilitada = !!habilitada;
  await db.guardar('config', config);
  return config;
}

/** "Nombre del negocio" de los 4 presets de composición (editable en Plantilla): vacío = no se
 * dibuja en ningún preset. */
export async function guardarNombreNegocio(nombreNegocio) {
  const config = await obtenerAjustesGenerales();
  config.nombreNegocio = String(nombreNegocio ?? '').slice(0, 60);
  await db.guardar('config', config);
  return config;
}

/** "Texto del botón/llamado" del preset "Banner inferior" (editable en Plantilla). */
export async function guardarTextoBoton(textoBoton) {
  const config = await obtenerAjustesGenerales();
  config.textoBoton = String(textoBoton ?? '').slice(0, 40) || TEXTO_BOTON_POR_DEFECTO;
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
  const secciones = await listarSecciones();

  return construirRespaldo({
    productos: productosConFoto,
    plantilla: { imagenBase64, ajustesPorEstilo: config.ajustesPorEstilo, formatoPrecio: config.formatoPrecio },
    general: {
      estiloGeneral: general.estiloGeneral,
      descripcionModelo: general.descripcionModelo,
      encuadreFoto: general.encuadreFoto,
      incluirTextoAlCompartir: general.incluirTextoAlCompartir,
      calidadImagen: general.calidadImagen,
      nombreNegocio: general.nombreNegocio,
      textoBoton: general.textoBoton,
    },
    secciones,
  });
}

/** Reemplaza TODOS los datos por los del respaldo (ya validado con validarRespaldo). */
export async function importarRespaldo(respaldo) {
  await db.vaciar('productos');
  await db.vaciar('blobs');
  await db.vaciar('config');
  await db.vaciar('secciones');

  // Colección de secciones: un respaldo de antes de la ronda "secciones" no la trae — queda `[]`
  // (nada que migrar: ninguna sección existía, así que ningún producto puede tener una asignada).
  const idsSeccionesValidos = new Set();
  for (const s of respaldo.secciones ?? []) {
    await db.guardar('secciones', { id: s.id, nombre: s.nombre, orden: s.orden ?? 0 });
    idsSeccionesValidos.add(s.id);
  }

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
      // solo secciones que existen en la colección importada (una lista vieja o corrupta con ids
      // huérfanos no deja "fantasmas" que no se puedan ver ni desasignar desde ningún lado).
      secciones: Array.isArray(p.secciones) ? p.secciones.filter((id) => idsSeccionesValidos.has(id)) : [],
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
    calidadImagen: respaldo.general?.calidadImagen || CALIDAD_IMAGEN_POR_DEFECTO,
    nombreNegocio: respaldo.general?.nombreNegocio ?? NOMBRE_NEGOCIO_POR_DEFECTO,
    textoBoton: respaldo.general?.textoBoton || TEXTO_BOTON_POR_DEFECTO,
  });
}
