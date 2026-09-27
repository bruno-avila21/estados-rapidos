// Funciones puras del modelo: formato de precio, validación de producto y de ajustes de plantilla.
// Sin DOM, sin IndexedDB — testeables con node:test.

export const VERSION_RESPALDO = 1;

export const AJUSTES_POR_DEFECTO = Object.freeze({
  foto: { x: 140, y: 130, w: 800, h: 800, modo: 'cover' },
  nombre: { x: 60, y: 990, w: 960, h: 160, tamano: 72, color: '#ffffff', peso: 700, alineacion: 'center' },
  precio: { x: 60, y: 1180, w: 960, h: 200, tamano: 100, color: '#f5a623', peso: 800, alineacion: 'center' },
});

export const FORMATO_PRECIO_POR_DEFECTO = Object.freeze({
  prefijo: '$ ',
  separadorMiles: true,
  decimales: false,
});

// --- Estilo de imagen (cambio de producto 2026-09-27: 3 modos, ver CREAR-BRIEF.md) ---
export const ESTILOS_IMAGEN = Object.freeze(['solo-foto', 'foto-precio', 'mi-plantilla']);
export const ESTILO_POR_DEFECTO = 'solo-foto';

// Franja de "Foto con precio": posiciones fijas (no configurables por ahora, a diferencia de
// "Mi plantilla"). Banda inferior semitransparente con nombre y precio sobre la foto.
export const AJUSTES_FRANJA_POR_DEFECTO = Object.freeze({
  franja: { x: 0, y: 1500, w: 1080, h: 420, color: 'rgba(10,12,16,0.72)' },
  nombre: { x: 60, y: 1560, w: 960, h: 140, tamano: 64, color: '#ffffff', peso: 700, alineacion: 'center' },
  precio: { x: 60, y: 1710, w: 960, h: 180, tamano: 92, color: '#f5a623', peso: 800, alineacion: 'center' },
});

export const DESCRIPCION_MODELO_POR_DEFECTO = '{nombre} a {precio} 🔥 Pedilo por privado';

/** Resuelve qué estilo de imagen usa un producto: su override si es válido, si no el general. */
export function resolverEstilo(producto, config) {
  const override = producto?.estilo;
  if (override && ESTILOS_IMAGEN.includes(override)) return override;
  const general = config?.estiloGeneral;
  return general && ESTILOS_IMAGEN.includes(general) ? general : ESTILO_POR_DEFECTO;
}

/** Reemplaza {nombre} {precio} {descripcion} en el texto modelo. Pura: recibe el precio ya formateado. */
export function aplicarPlantillaDescripcion(plantillaTexto, { nombre = '', precio = '', descripcion = '' } = {}) {
  const texto = plantillaTexto ?? DESCRIPCION_MODELO_POR_DEFECTO;
  return texto
    .replaceAll('{nombre}', nombre)
    .replaceAll('{precio}', precio)
    .replaceAll('{descripcion}', descripcion);
}

/**
 * Descripción efectiva de un producto: la propia si tiene una cargada, si no la que sale de
 * aplicar el modelo de Ajustes con los datos del producto (nombre, precio ya formateado).
 */
export function resolverDescripcion(producto, config) {
  const propia = String(producto?.descripcion ?? '').trim();
  if (propia) return propia;
  const modelo = config?.descripcionModelo || DESCRIPCION_MODELO_POR_DEFECTO;
  const precioFormateado = formatearPrecio(producto?.precio, config?.formatoPrecio);
  return aplicarPlantillaDescripcion(modelo, {
    nombre: producto?.nombre ?? '',
    precio: precioFormateado,
    descripcion: '',
  });
}

const FORMATEADORES = new Map();

function obtenerFormateador(decimales) {
  const clave = decimales ? 'con' : 'sin';
  if (!FORMATEADORES.has(clave)) {
    FORMATEADORES.set(
      clave,
      new Intl.NumberFormat('es-AR', {
        minimumFractionDigits: decimales ? 2 : 0,
        maximumFractionDigits: decimales ? 2 : 0,
      })
    );
  }
  return FORMATEADORES.get(clave);
}

/** Formatea un precio numérico según las opciones (miles con punto es-AR, prefijo configurable). */
export function formatearPrecio(valor, opciones = {}) {
  const { prefijo = FORMATO_PRECIO_POR_DEFECTO.prefijo, separadorMiles = true, decimales = false } =
    opciones;
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return `${prefijo}0`;
  const positivo = Math.max(0, numero);
  if (!separadorMiles) {
    const texto = decimales ? positivo.toFixed(2).replace('.', ',') : String(Math.round(positivo));
    return `${prefijo}${texto}`;
  }
  return `${prefijo}${obtenerFormateador(decimales).format(positivo)}`;
}

/**
 * Parsea lo que el usuario tipeó en el input de precio (admite "12.500", "12500", "12500,50").
 * A propósito NO clampea a 0: un vacío o un negativo tienen que llegar como `NaN`/negativo a
 * `validarProducto` para que se muestre un error, en vez de guardarse en silencio como "$ 0"
 * (QA.md 2026-09-27). `formatearPrecio` es quien clampea para mostrar, nunca este parseo.
 */
export function parsearPrecio(texto) {
  if (typeof texto === 'number') return texto;
  const limpio = String(texto ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '');
  if (!limpio) return NaN;
  // último separador presente antes de 1-2 dígitos finales se interpreta como decimal
  const normalizado = limpio.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  return parseFloat(normalizado);
}

/** Valida los campos de un producto antes de guardar. Devuelve {ok, errores:{campo:mensaje}}. */
export function validarProducto(producto) {
  const errores = {};
  const nombre = String(producto?.nombre ?? '').trim();
  if (!nombre) errores.nombre = 'Poné un nombre.';
  else if (nombre.length > 80) errores.nombre = 'Máximo 80 caracteres.';

  const precio = Number(producto?.precio);
  // vacío (NaN) o negativo/cero nunca se guarda en silencio como "$ 0" (QA.md 2026-09-27, hallazgo bajo).
  if (!Number.isFinite(precio) || precio <= 0) errores.precio = 'Poné un precio mayor a cero.';

  const descripcion = String(producto?.descripcion ?? '');
  if (descripcion.length > 300) errores.descripcion = 'Máximo 300 caracteres.';

  return { ok: Object.keys(errores).length === 0, errores };
}

/** Valida la forma de un archivo de respaldo importado, sin confiar en su contenido. */
export function validarRespaldo(objeto) {
  if (!objeto || typeof objeto !== 'object') return { ok: false, error: 'El archivo no es un respaldo válido.' };
  if (objeto.version !== VERSION_RESPALDO)
    return { ok: false, error: `Versión de respaldo no soportada (${objeto.version ?? 'sin versión'}).` };
  if (!Array.isArray(objeto.productos)) return { ok: false, error: 'Falta la lista de productos.' };
  if (objeto.productos.length > 2000) return { ok: false, error: 'Demasiados productos (máx. 2000).' };

  for (const [i, p] of objeto.productos.entries()) {
    if (!p || typeof p !== 'object') return { ok: false, error: `Producto #${i + 1} inválido.` };
    if (typeof p.id !== 'string' || !p.id) return { ok: false, error: `Producto #${i + 1} sin id.` };
    if (typeof p.nombre !== 'string') return { ok: false, error: `Producto #${i + 1} sin nombre.` };
    if (typeof p.precio !== 'number' || !Number.isFinite(p.precio))
      return { ok: false, error: `Producto #${i + 1} con precio inválido.` };
    if (p.fotoBase64 != null && typeof p.fotoBase64 !== 'string')
      return { ok: false, error: `Producto #${i + 1} con foto inválida.` };
    if (typeof p.fotoBase64 === 'string' && p.fotoBase64.length > 4_000_000)
      return { ok: false, error: `Producto #${i + 1}: la foto es demasiado grande.` };
    // Campos agregados 2026-09-27, opcionales por compatibilidad con respaldos viejos.
    if (p.estilo != null && !ESTILOS_IMAGEN.includes(p.estilo))
      return { ok: false, error: `Producto #${i + 1} con estilo de imagen inválido.` };
    if (p.seleccionado != null && typeof p.seleccionado !== 'boolean')
      return { ok: false, error: `Producto #${i + 1} con selección inválida.` };
  }

  if (objeto.general != null) {
    if (typeof objeto.general !== 'object') return { ok: false, error: 'La sección "general" del respaldo es inválida.' };
    if (objeto.general.estiloGeneral != null && !ESTILOS_IMAGEN.includes(objeto.general.estiloGeneral))
      return { ok: false, error: 'Estilo general inválido en el respaldo.' };
    if (objeto.general.descripcionModelo != null && typeof objeto.general.descripcionModelo !== 'string')
      return { ok: false, error: 'Descripción modelo inválida en el respaldo.' };
  }

  if (objeto.plantilla != null) {
    if (typeof objeto.plantilla !== 'object') return { ok: false, error: 'Plantilla inválida.' };
    if (objeto.plantilla.imagenBase64 != null && typeof objeto.plantilla.imagenBase64 !== 'string')
      return { ok: false, error: 'Imagen de plantilla inválida.' };
    if (
      typeof objeto.plantilla.imagenBase64 === 'string' &&
      objeto.plantilla.imagenBase64.length > 8_000_000
    )
      return { ok: false, error: 'La imagen de plantilla es demasiado grande.' };
  }

  return { ok: true, error: null };
}

/** Arma el objeto de respaldo (puro: recibe los datos ya leídos, no toca IndexedDB). */
export function construirRespaldo({ productos, plantilla, general }) {
  return {
    version: VERSION_RESPALDO,
    exportadoEn: new Date().toISOString(),
    productos: productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      descripcion: p.descripcion ?? '',
      fotoBase64: p.fotoBase64 ?? null,
      estilo: p.estilo ?? null,
      seleccionado: p.seleccionado ?? true,
      creado: p.creado,
      actualizado: p.actualizado,
    })),
    plantilla: plantilla
      ? {
          imagenBase64: plantilla.imagenBase64 ?? null,
          ajustes: plantilla.ajustes ?? AJUSTES_POR_DEFECTO,
          formatoPrecio: plantilla.formatoPrecio ?? FORMATO_PRECIO_POR_DEFECTO,
        }
      : null,
    general: general
      ? {
          estiloGeneral: general.estiloGeneral ?? ESTILO_POR_DEFECTO,
          descripcionModelo: general.descripcionModelo ?? DESCRIPCION_MODELO_POR_DEFECTO,
        }
      : null,
  };
}

export function generarId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
