// Funciones puras del modelo: formato de precio, validación de producto y de ajustes de plantilla.
// Sin DOM, sin IndexedDB — testeables con node:test.

export const VERSION_RESPALDO = 1;

// --- Tipografías OFL autoalojadas (ver js/fuentes.js para la carga con FontFace) ---
export const FUENTES_DISPONIBLES = Object.freeze(['inter', 'montserrat', 'poppins', 'playfair', 'bebas-neue', 'pacifico']);
export const FUENTE_POR_DEFECTO = 'inter';
export const ETIQUETA_FUENTE = Object.freeze({
  inter: 'Inter',
  montserrat: 'Montserrat',
  poppins: 'Poppins',
  playfair: 'Playfair Display',
  'bebas-neue': 'Bebas Neue',
  pacifico: 'Pacifico',
});

function cajaTexto(extra) {
  return {
    x: 60,
    y: 1460,
    w: 960,
    h: 130,
    tamano: 60,
    color: '#ffffff',
    peso: 700,
    alineacion: 'center',
    familia: FUENTE_POR_DEFECTO,
    fondoColor: '#05060a',
    fondoOpacidad: 0.55,
    fondoRadio: 18,
    visible: true,
    ...extra,
  };
}

// Geometría/tipografía de PARTIDA (posición, tamaño, tipografía, color, fondo/etiqueta) para las
// 4 cajas editables. Hasta la ronda 2026-09-28 esto era el único juego de ajustes y lo compartían
// los 3 estilos con texto; ahora es solo la base sobre la que se arma `AJUSTES_POR_DEFECTO_POR_ESTILO`
// (cada estilo con su propia visibilidad de fábrica — ver más abajo). `foto` es la excepción: solo
// se usa en "Mi plantilla" (en los otros dos la foto siempre ocupa toda la imagen).
export const AJUSTES_POR_DEFECTO = Object.freeze({
  foto: { x: 140, y: 130, w: 800, h: 800, modo: 'cover', visible: true },
  nombre: cajaTexto({ y: 1460, h: 120, tamano: 58 }),
  precio: cajaTexto({ y: 1590, h: 130, tamano: 84, color: '#a78bfa', peso: 800 }),
  descripcion: cajaTexto({ y: 1730, h: 150, tamano: 38, peso: 400 }),
});

/** Completa una caja guardada (posiblemente parcial, de un respaldo viejo) con los valores por
 * defecto de esa caja — así un respaldo de antes de 2026-09-27 (sin `familia`/`fondoColor`/etc.,
 * o directamente sin `descripcion`) sigue importando bien. */
function normalizarCaja(base, guardada) {
  if (!guardada || typeof guardada !== 'object') return { ...base };
  return { ...base, ...guardada };
}

/** Ajustes "compartidos" normalizados (formato de antes de la ronda "ajustes por estilo"):
 * se usa solo como paso intermedio de la migración de un respaldo/config viejo. */
export function normalizarAjustes(ajustesGuardados) {
  const g = ajustesGuardados || {};
  return {
    foto: normalizarCaja(AJUSTES_POR_DEFECTO.foto, g.foto),
    nombre: normalizarCaja(AJUSTES_POR_DEFECTO.nombre, g.nombre),
    precio: normalizarCaja(AJUSTES_POR_DEFECTO.precio, g.precio),
    descripcion: normalizarCaja(AJUSTES_POR_DEFECTO.descripcion, g.descripcion),
  };
}

function clonar(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/** Arma el juego de ajustes por defecto de UN estilo: la misma geometría de base, con la
 * visibilidad de fábrica de ese estilo (las demás claves quedan armadas igual, solo ocultas). */
function ajustesConVisibilidad(clavesVisibles) {
  const base = clonar(AJUSTES_POR_DEFECTO);
  for (const clave of ['foto', 'nombre', 'precio', 'descripcion']) {
    base[clave] = { ...base[clave], visible: clavesVisibles.includes(clave) };
  }
  return base;
}

// --- Ajustes POR ESTILO (ronda 2026-09-28: "configuración por estilo") ---
// Los 3 estilos con texto dejan de compartir un único juego de ajustes: cada uno tiene su propia
// configuración (posición/tipografía/color/fondo/visibilidad), con estos defaults de fábrica:
//   - foto-precio: nombre + precio visibles, descripción oculta.
//   - foto-descripcion: descripción visible, nombre y precio ocultos (la descripción ya suele
//     incluirlos, vía {nombre}/{precio} en el modelo de texto).
//   - mi-plantilla: foto + nombre + precio visibles, descripción oculta.
// "Solo la foto" no tiene ajustes propios (nunca dibuja texto ni plantilla) y no aparece acá.
export const ESTILOS_CON_AJUSTES = Object.freeze(['foto-precio', 'foto-descripcion', 'mi-plantilla']);

export const AJUSTES_POR_DEFECTO_POR_ESTILO = Object.freeze({
  'foto-precio': Object.freeze(ajustesConVisibilidad(['nombre', 'precio'])),
  'foto-descripcion': Object.freeze(ajustesConVisibilidad(['descripcion'])),
  'mi-plantilla': Object.freeze(ajustesConVisibilidad(['foto', 'nombre', 'precio'])),
});

/** Normaliza los ajustes de UN estilo contra sus propios defaults (completa cajas parciales o
 * ausentes, como `normalizarCaja` pero por estilo). */
function normalizarAjustesDeEstilo(estilo, guardado) {
  const base = AJUSTES_POR_DEFECTO_POR_ESTILO[estilo] || AJUSTES_POR_DEFECTO_POR_ESTILO['foto-precio'];
  const g = guardado || {};
  return {
    foto: normalizarCaja(base.foto, g.foto),
    nombre: normalizarCaja(base.nombre, g.nombre),
    precio: normalizarCaja(base.precio, g.precio),
    descripcion: normalizarCaja(base.descripcion, g.descripcion),
  };
}

/** Normaliza el objeto `ajustesPorEstilo` completo: cada estilo contra sus propios defaults, así
 * un config nuevo pero con un estilo faltante (o con cajas parciales) queda completo igual. */
export function normalizarAjustesPorEstilo(guardadoPorEstilo) {
  const g = guardadoPorEstilo || {};
  const resultado = {};
  for (const estilo of ESTILOS_CON_AJUSTES) {
    resultado[estilo] = normalizarAjustesDeEstilo(estilo, g[estilo]);
  }
  return resultado;
}

/** ¿Lo guardado tiene la forma VIEJA (ajustes compartidos, de antes de esta ronda)? Esas 4 claves
 * de caja directamente en el objeto (no anidadas bajo 'foto-precio'/'foto-descripcion'/'mi-plantilla')
 * son la señal de un config de antes de 2026-09-28. */
function esFormatoAjustesCompartidoViejo(objeto) {
  if (!objeto || typeof objeto !== 'object') return false;
  return ['foto', 'nombre', 'precio', 'descripcion'].some((clave) => clave in objeto);
}

/**
 * Migra lo guardado de plantilla (todo el registro `config.plantilla`, o la sección `plantilla`
 * de un respaldo) al formato nuevo `ajustesPorEstilo`:
 *   - ya viene en formato nuevo (`ajustesPorEstilo`) → se normaliza cada estilo.
 *   - formato VIEJO (`ajustes` compartido, de antes de esta ronda) → se copia lo que el usuario
 *     ya armó a los 3 estilos por igual (se conserva su trabajo, no se pierde nada).
 *   - nada guardado → los defaults de cada estilo.
 */
export function migrarAjustesPorEstilo(configGuardada) {
  if (!configGuardada) return normalizarAjustesPorEstilo(null);
  if (configGuardada.ajustesPorEstilo) return normalizarAjustesPorEstilo(configGuardada.ajustesPorEstilo);
  if (esFormatoAjustesCompartidoViejo(configGuardada.ajustes)) {
    const compartido = normalizarAjustes(configGuardada.ajustes);
    return {
      'foto-precio': clonar(compartido),
      'foto-descripcion': clonar(compartido),
      'mi-plantilla': clonar(compartido),
    };
  }
  return normalizarAjustesPorEstilo(null);
}

/** ¿Los ajustes de este estilo son distintos de sus defaults de fábrica? Maneja el badge
 * "Personalizado" (editor y tarjeta de Ajustes) y si corresponde ofrecer "Volver al original". */
export function esAjustePersonalizado(estilo, ajustesDelEstilo) {
  const defaults = AJUSTES_POR_DEFECTO_POR_ESTILO[estilo];
  if (!defaults || !ajustesDelEstilo) return false;
  const normalizado = normalizarAjustesDeEstilo(estilo, ajustesDelEstilo);
  return JSON.stringify(normalizado) !== JSON.stringify(defaults);
}

export const FORMATO_PRECIO_POR_DEFECTO = Object.freeze({
  prefijo: '$ ',
  separadorMiles: true,
  decimales: false,
});

// --- Estilo de imagen (2026-09-27: 4 modos, ver CREAR-BRIEF.md) ---
export const ESTILOS_IMAGEN = Object.freeze(['solo-foto', 'foto-precio', 'foto-descripcion', 'mi-plantilla']);
export const ESTILO_POR_DEFECTO = 'solo-foto';
export const ETIQUETA_ESTILO = Object.freeze({
  'solo-foto': 'Solo la foto',
  'foto-precio': 'Foto con precio',
  'foto-descripcion': 'Foto con descripción',
  'mi-plantilla': 'Mi plantilla',
});

export const DESCRIPCION_MODELO_POR_DEFECTO = '{nombre} a {precio} 🔥 Pedilo por privado';

// --- Encuadre de la foto en "Foto con precio"/"Foto con descripción" (ronda distribución) ---
// 'contain' (defecto): la foto entera, sin recortar, con fondo difuminado de la misma foto (igual
// que "Solo la foto"). 'cover': la foto llena toda la pantalla, recortada si hace falta (el
// comportamiento de antes de esta ronda). Ajuste GENERAL (Ajustes → Estilo de las imágenes), no
// por producto.
export const ENCUADRES_FOTO = Object.freeze(['contain', 'cover']);
export const ENCUADRE_FOTO_POR_DEFECTO = 'contain';
export const ETIQUETA_ENCUADRE_FOTO = Object.freeze({ contain: 'Entera', cover: 'Llenar la pantalla' });

/** Resuelve qué estilo de imagen usa un producto: su override si es válido, si no el general. */
export function resolverEstilo(producto, config) {
  const override = producto?.estilo;
  if (override && ESTILOS_IMAGEN.includes(override)) return override;
  const general = config?.estiloGeneral;
  return general && ESTILOS_IMAGEN.includes(general) ? general : ESTILO_POR_DEFECTO;
}

/**
 * Reemplaza {nombre} {precio} {descripcion} en el texto modelo. Pura: recibe el precio ya
 * formateado (o `''` si el producto no tiene precio). Sin precio, se saca el marcador JUNTO con
 * un conector inmediatamente antes ("a", "por", "de", "en") para no dejar nada colgando —
 * "{nombre} a {precio} 🔥" sin precio da "{nombre} 🔥", no "{nombre} a  🔥" (precio opcional,
 * CREAR-BRIEF.md 2026-09-27).
 */
export function aplicarPlantillaDescripcion(plantillaTexto, { nombre = '', precio = '', descripcion = '' } = {}) {
  const texto = plantillaTexto ?? DESCRIPCION_MODELO_POR_DEFECTO;
  let resultado = texto;
  if (!precio) {
    resultado = resultado.replace(/\s*\b(a|por|de|en)\b\s*\{precio\}/gi, '');
    resultado = resultado.replace(/\{precio\}/g, '');
  } else {
    resultado = resultado.replaceAll('{precio}', precio);
  }
  resultado = resultado.replaceAll('{nombre}', nombre).replaceAll('{descripcion}', descripcion);
  // colapsar espacios dobles que hayan quedado al sacar el marcador, y recortar puntas
  return resultado.replace(/[ \t]{2,}/g, ' ').trim();
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

/**
 * Formatea un precio numérico según las opciones (miles con punto es-AR, prefijo configurable).
 * `null`/`undefined` (producto sin precio, CREAR-BRIEF.md 2026-09-27) y cualquier valor no
 * positivo devuelven `''` — nunca "$ 0": la UI decide qué mostrar ("Sin precio") con eso.
 */
export function formatearPrecio(valor, opciones = {}) {
  const { prefijo = FORMATO_PRECIO_POR_DEFECTO.prefijo, separadorMiles = true, decimales = false } =
    opciones;
  if (valor === null || valor === undefined) return '';
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero <= 0) return '';
  if (!separadorMiles) {
    const texto = decimales ? numero.toFixed(2).replace('.', ',') : String(Math.round(numero));
    return `${prefijo}${texto}`;
  }
  return `${prefijo}${obtenerFormateador(decimales).format(numero)}`;
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

  // Precio OPCIONAL (CREAR-BRIEF.md 2026-09-27): null/undefined = "sin precio", válido. Si se
  // cargó algo, tiene que ser positivo — un negativo sigue siendo inválido.
  const precioBruto = producto?.precio;
  if (precioBruto !== null && precioBruto !== undefined) {
    const precio = Number(precioBruto);
    if (!Number.isFinite(precio) || precio <= 0) {
      errores.precio = 'El precio tiene que ser mayor a cero (o dejalo vacío para no mostrarlo).';
    }
  }

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
    // precio opcional (CREAR-BRIEF.md 2026-09-27): null es "sin precio" y es válido.
    if (p.precio !== null && (typeof p.precio !== 'number' || !Number.isFinite(p.precio)))
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
    if (objeto.general.encuadreFoto != null && !ENCUADRES_FOTO.includes(objeto.general.encuadreFoto))
      return { ok: false, error: 'Encuadre de foto inválido en el respaldo.' };
    if (objeto.general.incluirTextoAlCompartir != null && typeof objeto.general.incluirTextoAlCompartir !== 'boolean')
      return { ok: false, error: '"Incluir texto" inválido en el respaldo.' };
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
          ajustesPorEstilo: plantilla.ajustesPorEstilo ?? AJUSTES_POR_DEFECTO_POR_ESTILO,
          formatoPrecio: plantilla.formatoPrecio ?? FORMATO_PRECIO_POR_DEFECTO,
        }
      : null,
    general: general
      ? {
          estiloGeneral: general.estiloGeneral ?? ESTILO_POR_DEFECTO,
          descripcionModelo: general.descripcionModelo ?? DESCRIPCION_MODELO_POR_DEFECTO,
          encuadreFoto: general.encuadreFoto ?? ENCUADRE_FOTO_POR_DEFECTO,
          incluirTextoAlCompartir: general.incluirTextoAlCompartir ?? true,
        }
      : null,
  };
}

export function generarId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
