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

/** Parsea lo que el usuario tipeó en el input de precio (admite "12.500", "12500", "12500,50"). */
export function parsearPrecio(texto) {
  if (typeof texto === 'number') return Number.isFinite(texto) ? texto : 0;
  const limpio = String(texto ?? '')
    .trim()
    .replace(/[^\d,.-]/g, '');
  if (!limpio) return 0;
  // último separador presente antes de 1-2 dígitos finales se interpreta como decimal
  const normalizado = limpio.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  const numero = parseFloat(normalizado);
  return Number.isFinite(numero) ? Math.max(0, numero) : 0;
}

/** Valida los campos de un producto antes de guardar. Devuelve {ok, errores:{campo:mensaje}}. */
export function validarProducto(producto) {
  const errores = {};
  const nombre = String(producto?.nombre ?? '').trim();
  if (!nombre) errores.nombre = 'Poné un nombre.';
  else if (nombre.length > 80) errores.nombre = 'Máximo 80 caracteres.';

  const precio = Number(producto?.precio);
  if (!Number.isFinite(precio) || precio < 0) errores.precio = 'El precio tiene que ser un número positivo.';

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
export function construirRespaldo({ productos, plantilla }) {
  return {
    version: VERSION_RESPALDO,
    exportadoEn: new Date().toISOString(),
    productos: productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      descripcion: p.descripcion ?? '',
      fotoBase64: p.fotoBase64 ?? null,
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
  };
}

export function generarId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
