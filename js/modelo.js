// Funciones puras del modelo: formato de precio, validación de producto y de ajustes de plantilla.
// Sin DOM, sin IndexedDB — testeables con node:test.
import {
  geometriaBannerInferior,
  geometriaEditorial,
  geometriaPolaroid,
  geometriaStoryInmersiva,
  geometriaNovedad,
  geometriaFichaNatural,
} from './geometria-presets.js';

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
// Los estilos con texto no comparten un único juego de ajustes: cada uno tiene su propia
// configuración (posición/tipografía/color/fondo/visibilidad), con estos defaults de fábrica:
//   - foto-precio: nombre + precio visibles, descripción oculta.
//   - foto-descripcion: descripción visible, nombre y precio ocultos (la descripción ya suele
//     incluirlos, vía {nombre}/{precio} en el modelo de texto).
//   - mi-plantilla: foto + nombre + precio visibles, descripción oculta.
//   - los 4 presets de composición (Fase 4, ver más abajo): nombre + precio + descripción
//     visibles, foto SIEMPRE oculta acá (su foto va a una zona de geometría fija propia del
//     preset — franja/marco/tarjeta/scrim en componer.js —, no es una caja que el usuario mueva).
// "Solo la foto" no tiene ajustes propios (nunca dibuja texto ni plantilla) y no aparece acá.
export const ESTILOS_CON_AJUSTES = Object.freeze([
  'foto-precio',
  'foto-descripcion',
  'mi-plantilla',
  'banner-inferior',
  'editorial',
  'polaroid',
  'story-inmersiva',
  'novedad',
  'ficha-natural',
]);

/** Caja de texto de partida para uno de los 4 presets de composición: geometría (x/y/w/h) de las
 * funciones puras de geometria-presets.js + estilo tipográfico propio de cada preset. Reusa el
 * mismo mecanismo de `ajustes` que los demás estilos con texto (tamaño/color/tipografía/fondo/
 * visibilidad, editables en el editor de plantilla) — la única diferencia real con `cajaTexto()`
 * es que acá la posición de partida sale de un cálculo, no de un número fijo a mano, y que puede
 * llevar `elipsis:true` (ver dibujarCajaTexto en componer.js). */
function cajaPreset(rect, extra) {
  return {
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
    tamano: 48,
    color: '#ffffff',
    peso: 700,
    alineacion: 'center',
    familia: FUENTE_POR_DEFECTO,
    fondoColor: null,
    fondoOpacidad: 0,
    fondoRadio: 0,
    maxLineas: 2,
    visible: true,
    elipsis: true,
    ...extra,
  };
}

// Geometría de PARTIDA de los 4 presets, con precio y descripción visibles (el máximo de
// contenido) — es la que arma la posición inicial de cada caja; en el dibujo real (componer.js)
// la zona decorativa (franja/marco/tarjeta/scrim) se recalcula con la visibilidad VIGENTE.
const GEO_BANNER_INFERIOR = geometriaBannerInferior({ conPrecio: true, conDescripcion: true });
const GEO_EDITORIAL = geometriaEditorial({ conPrecio: true, conDescripcion: true });
const GEO_POLAROID = geometriaPolaroid({ conPrecio: true, conDescripcion: true });
const GEO_STORY_INMERSIVA = geometriaStoryInmersiva({ conPrecio: true, conDescripcion: true });
const GEO_NOVEDAD = geometriaNovedad({ conPrecio: true, conDescripcion: true });
const GEO_FICHA_NATURAL = geometriaFichaNatural({ conPrecio: true, conDescripcion: true });

// Tipografía de fábrica de los 4 presets (ronda 2026-09-29, "presets calzan con los mocks"): serif
// Newsreader para nombre/precio (títulos, igual que los 4 mocks Stitch) + sans Manrope para
// descripción/etiquetas — NO son elegibles en el editor de plantilla (no están en
// `FUENTES_DISPONIBLES`: son fijas por diseño, cada preset con la suya, igual que la franja/marco/
// tarjeta/scrim que tampoco es editable). Antes de esta ronda usaban Montserrat/Playfair a un
// tamaño mucho más chico (~la mitad) que el de los mocks — el bug que esta ronda corrige.
function ajustesBannerInferior() {
  return {
    foto: { ...AJUSTES_POR_DEFECTO.foto, visible: false },
    nombre: cajaPreset(GEO_BANNER_INFERIOR.nombre, { tamano: 68, alineacion: 'left', familia: 'newsreader', peso: 500, color: '#fdf8f5' }),
    precio: cajaPreset(GEO_BANNER_INFERIOR.precio, {
      tamano: 58,
      peso: 700,
      alineacion: 'right',
      familia: 'manrope',
      color: '#f9dec7',
      maxLineas: 1,
    }),
    descripcion: cajaPreset(GEO_BANNER_INFERIOR.descripcion, {
      tamano: 32,
      peso: 400,
      alineacion: 'left',
      familia: 'manrope',
      color: 'rgba(253,248,245,0.85)',
      maxLineas: 2,
    }),
  };
}

function ajustesEditorial() {
  return {
    foto: { ...AJUSTES_POR_DEFECTO.foto, visible: false },
    nombre: cajaPreset(GEO_EDITORIAL.nombre, { tamano: 76, alineacion: 'left', familia: 'newsreader', peso: 500, color: '#1c1b1a', maxLineas: 2 }),
    precio: cajaPreset(GEO_EDITORIAL.precio, { tamano: 30, alineacion: 'left', familia: 'manrope', peso: 600, color: '#3a4d39', maxLineas: 1 }),
    descripcion: cajaPreset(GEO_EDITORIAL.descripcion, {
      tamano: 28,
      peso: 400,
      alineacion: 'left',
      familia: 'manrope',
      color: '#5c584f',
      maxLineas: 3,
    }),
  };
}

function ajustesPolaroid() {
  return {
    foto: { ...AJUSTES_POR_DEFECTO.foto, visible: false },
    nombre: cajaPreset(GEO_POLAROID.nombre, { tamano: 84, alineacion: 'center', familia: 'newsreader', peso: 500, color: '#242220', maxLineas: 2 }),
    precio: cajaPreset(GEO_POLAROID.precio, { tamano: 78, alineacion: 'center', familia: 'newsreader', peso: 700, color: '#3a4d39', maxLineas: 1 }),
    descripcion: cajaPreset(GEO_POLAROID.descripcion, {
      tamano: 30,
      peso: 400,
      alineacion: 'center',
      familia: 'newsreader-italica',
      color: '#6e5b49',
      maxLineas: 2,
    }),
  };
}

function ajustesStoryInmersiva() {
  return {
    foto: { ...AJUSTES_POR_DEFECTO.foto, visible: false },
    nombre: cajaPreset(GEO_STORY_INMERSIVA.nombre, { tamano: 88, alineacion: 'left', familia: 'newsreader', peso: 400, color: '#ffffff', maxLineas: 2 }),
    precio: cajaPreset(GEO_STORY_INMERSIVA.precio, {
      tamano: 30,
      alineacion: 'center',
      familia: 'manrope',
      peso: 700,
      color: '#ffffff',
      fondoColor: '#ffffff',
      fondoOpacidad: 0.2,
      fondoRadio: 40,
      maxLineas: 1,
    }),
    descripcion: cajaPreset(GEO_STORY_INMERSIVA.descripcion, {
      tamano: 26,
      peso: 400,
      alineacion: 'left',
      familia: 'manrope',
      color: 'rgba(255,255,255,0.88)',
      maxLineas: 1,
    }),
  };
}

// "Novedad" y "Ficha natural" (2026-10-07): colores y tamaños medidos de los dos diseños que
// entregó Bruno. La caja del precio ES la etiqueta del diseño (fondo + radio propios); el borde
// crema de "Novedad" y el prefijo "Precio:" de "Ficha natural" los pone componer.js.
// Piezas FIJAS de cada preset que también se pueden mover/agrandar/achicar/ocultar desde el
// editor (pedido 2026-10-07: "debería poder mover, agrandar, achicar todo"). Son cajas simples
// (x/y/w/h/visible, sin tipografía): su contenido lo dibuja componer.js escalado a la caja.
export const ELEMENTOS_DECORATIVOS = Object.freeze({
  novedad: Object.freeze(['pill', 'divisor', 'contacto', 'divisorInferior']),
  'ficha-natural': Object.freeze(['insignia', 'divisor', 'contacto']),
});
export const ETIQUETA_DECORATIVO = Object.freeze({
  pill: 'Etiqueta superior',
  divisor: 'Divisor',
  divisorInferior: 'Divisor inferior',
  contacto: 'Llamado de WhatsApp',
  insignia: 'Insignia',
});
/** Los divisores se estiran a lo ancho (la hoja no cambia); el resto escala parejo. */
export const DECORATIVOS_ELASTICOS = Object.freeze(['divisor', 'divisorInferior']);

/** Rectángulo de una pieza decorativa en una geometría (la insignia viene como círculo). Pura. */
export function rectDecorativo(geometria, clave) {
  const zona = geometria?.[clave];
  if (!zona) return null;
  if ('r' in zona) return { x: zona.cx - zona.r, y: zona.cy - zona.r, w: zona.r * 2, h: zona.r * 2 };
  return { x: zona.x, y: zona.y, w: zona.w, h: zona.h };
}

function cajasDecorativas(estilo, geometria) {
  const cajas = {};
  for (const clave of ELEMENTOS_DECORATIVOS[estilo]) cajas[clave] = { ...rectDecorativo(geometria, clave), visible: true };
  return cajas;
}

function ajustesNovedad() {
  return {
    ...cajasDecorativas('novedad', GEO_NOVEDAD),
    foto: { ...AJUSTES_POR_DEFECTO.foto, visible: false },
    nombre: cajaPreset(GEO_NOVEDAD.nombre, { tamano: 108, alineacion: 'left', familia: 'newsreader', peso: 700, color: '#f1e9d6', maxLineas: 2 }),
    precio: cajaPreset(GEO_NOVEDAD.precio, {
      tamano: 88,
      alineacion: 'center',
      familia: 'manrope',
      peso: 700,
      color: '#f4ecd9',
      fondoColor: '#2b3b1e',
      fondoOpacidad: 1,
      fondoRadio: 34,
      maxLineas: 1,
    }),
    descripcion: cajaPreset(GEO_NOVEDAD.descripcion, {
      tamano: 40,
      peso: 400,
      alineacion: 'left',
      familia: 'manrope',
      color: '#f1e9d6',
      maxLineas: 1,
    }),
  };
}

function ajustesFichaNatural() {
  return {
    ...cajasDecorativas('ficha-natural', GEO_FICHA_NATURAL),
    foto: { ...AJUSTES_POR_DEFECTO.foto, visible: false },
    nombre: cajaPreset(GEO_FICHA_NATURAL.nombre, { tamano: 104, alineacion: 'center', familia: 'newsreader', peso: 700, color: '#2f3e22', maxLineas: 2 }),
    precio: cajaPreset(GEO_FICHA_NATURAL.precio, {
      tamano: 58,
      alineacion: 'center',
      familia: 'newsreader',
      peso: 500,
      color: '#2a2a26',
      fondoColor: '#e6dccb',
      fondoOpacidad: 1,
      fondoRadio: 18,
      maxLineas: 1,
    }),
    descripcion: cajaPreset(GEO_FICHA_NATURAL.descripcion, {
      tamano: 42,
      peso: 400,
      alineacion: 'center',
      familia: 'manrope',
      color: '#2a2a26',
      maxLineas: 1,
    }),
  };
}

export const AJUSTES_POR_DEFECTO_POR_ESTILO = Object.freeze({
  'foto-precio': Object.freeze(ajustesConVisibilidad(['nombre', 'precio'])),
  'foto-descripcion': Object.freeze(ajustesConVisibilidad(['descripcion'])),
  'mi-plantilla': Object.freeze(ajustesConVisibilidad(['foto', 'nombre', 'precio'])),
  'banner-inferior': Object.freeze(ajustesBannerInferior()),
  editorial: Object.freeze(ajustesEditorial()),
  polaroid: Object.freeze(ajustesPolaroid()),
  'story-inmersiva': Object.freeze(ajustesStoryInmersiva()),
  novedad: Object.freeze(ajustesNovedad()),
  'ficha-natural': Object.freeze(ajustesFichaNatural()),
});

/** Normaliza los ajustes de UN estilo contra sus propios defaults (completa cajas parciales o
 * ausentes, como `normalizarCaja` pero por estilo). */
function normalizarAjustesDeEstilo(estilo, guardado) {
  const base = AJUSTES_POR_DEFECTO_POR_ESTILO[estilo] || AJUSTES_POR_DEFECTO_POR_ESTILO['foto-precio'];
  const g = guardado || {};
  // Las piezas decorativas van primero, en el mismo orden que los defaults (así
  // `esAjustePersonalizado` compara igual); un guardado de antes de 2026-10-07 no las trae.
  const decorativas = {};
  for (const clave of ELEMENTOS_DECORATIVOS[estilo] ?? []) decorativas[clave] = normalizarCaja(base[clave], g[clave]);
  return {
    ...decorativas,
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
    // Los 4 presets de composición (Fase 4) no existían cuando se guardó este respaldo VIEJO: no
    // hay nada del usuario para copiarles, así que arrancan con sus propios defaults de fábrica en
    // vez de quedar ausentes (`normalizarAjustesPorEstilo` ya los completa a todos).
    return {
      ...normalizarAjustesPorEstilo(null),
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

// --- Fondos de texto PREDEFINIDOS (Fase 2, "S" #3): unos pocos presets de fondo/etiqueta
// (color + opacidad + radio) aplicables con un toque en el editor de plantilla, además del color
// libre que ya existía. Colores tomados de los tokens de la piel "Organic Minimalist"
// (css/estilos.css: --color-texto, --color-primario, --color-acento) para que calcen con el resto
// de la app en vez de inventar una paleta aparte. */
export const PRESETS_FONDO_TEXTO = Object.freeze([
  { id: 'sin-fondo', nombre: 'Sin fondo', fondoColor: '#242220', fondoOpacidad: 0, fondoRadio: 0 },
  { id: 'tinta-suave', nombre: 'Tinta suave', fondoColor: '#242220', fondoOpacidad: 0.55, fondoRadio: 18 },
  { id: 'lino-claro', nombre: 'Lino claro', fondoColor: '#f3efea', fondoOpacidad: 0.9, fondoRadio: 12 },
  { id: 'contraste-alto', nombre: 'Contraste alto', fondoColor: '#242220', fondoOpacidad: 0.9, fondoRadio: 4 },
  { id: 'acento', nombre: 'Acento', fondoColor: '#3a4d39', fondoOpacidad: 0.7, fondoRadio: 24 },
]);

/** Aplica un preset de fondo/etiqueta (por `id` de PRESETS_FONDO_TEXTO) a una caja de texto: pura,
 * no muta `caja`. Un id que no existe devuelve `caja` sin cambios (defensivo, mismo criterio que
 * `crearIcono` con un nombre desconocido). */
export function aplicarPresetFondo(caja, presetId) {
  const preset = PRESETS_FONDO_TEXTO.find((p) => p.id === presetId);
  if (!preset || !caja) return caja;
  return { ...caja, fondoColor: preset.fondoColor, fondoOpacidad: preset.fondoOpacidad, fondoRadio: preset.fondoRadio };
}

// --- Calidad de imagen al exportar (Fase 2, "S" #5): "Estándar" vs "Alta", elegible en la hoja de
// revisión y recordada en los ajustes generales. Medido contra una foto real (900×900) compuesta a
// 1080×1920 con texto ("Foto con precio"): JPEG 0.85 ≈ 59KB, 0.9 (el fijo de antes) ≈ 73KB, 0.95 ≈
// 102KB, PNG ≈ 230KB. PNG queda descartado para "Alta": es 2-3× más pesado que JPEG 0.95 sin
// beneficio real, porque WhatsApp recomprime la imagen que reciba de todos modos (ver componer.js)
// — más peso solo alarga la espera para compartir. "Alta" es JPEG 0.95 (mejor calidad visible,
// sigue liviano); "Estándar" baja a JPEG 0.85 (antes 0.9 fijo): más rápida de armar y compartir,
// con una pérdida de nitidez que no se nota en la pantalla de un celular.
export const CALIDADES_IMAGEN = Object.freeze(['estandar', 'alta']);
export const CALIDAD_IMAGEN_POR_DEFECTO = 'estandar';
export const ETIQUETA_CALIDAD_IMAGEN = Object.freeze({ estandar: 'Estándar', alta: 'Alta' });
export const OPCIONES_EXPORTACION_POR_CALIDAD = Object.freeze({
  estandar: Object.freeze({ formato: 'image/jpeg', calidad: 0.85 }),
  alta: Object.freeze({ formato: 'image/jpeg', calidad: 0.95 }),
});

/** {formato, calidad} para `componerSegunEstilo` según la calidad elegida ('estandar'/'alta'); un
 * valor inválido o ausente cae a la calidad por defecto. */
export function resolverOpcionesExportacion(calidadImagen) {
  return OPCIONES_EXPORTACION_POR_CALIDAD[calidadImagen] ?? OPCIONES_EXPORTACION_POR_CALIDAD[CALIDAD_IMAGEN_POR_DEFECTO];
}

// --- Estilo de imagen (2026-09-27: 4 modos, ver CREAR-BRIEF.md; Fase 4 2026-09-28: + 4 presets de
// composición — banner inferior/editorial/polaroid/story inmersiva, catálogo de presets) ---
export const ESTILOS_IMAGEN = Object.freeze([
  'solo-foto',
  'foto-precio',
  'foto-descripcion',
  'mi-plantilla',
  'banner-inferior',
  'editorial',
  'polaroid',
  'story-inmersiva',
  'novedad',
  'ficha-natural',
]);
export const ESTILO_POR_DEFECTO = 'solo-foto';
export const ETIQUETA_ESTILO = Object.freeze({
  'solo-foto': 'Solo la foto',
  'foto-precio': 'Foto con precio',
  'foto-descripcion': 'Foto con descripción',
  'mi-plantilla': 'Mi plantilla',
  'banner-inferior': 'Banner inferior',
  editorial: 'Editorial',
  polaroid: 'Polaroid',
  'story-inmersiva': 'Story inmersiva',
  novedad: 'Novedad',
  'ficha-natural': 'Ficha natural',
});

// Los 4 presets de composición son un subconjunto de ESTILOS_IMAGEN (Fase 4): un "preset" es,
// para el modelo, un estilo de imagen más — misma resolución (resolverEstilo), mismo mecanismo de
// ajustes por estilo, mismo override por producto en "Opciones avanzadas". Esta lista solo existe
// para la galería de presets del editor de plantilla (js/vistas/plantilla.js): son los que tiene
// sentido mostrar ahí como "composiciones prediseñadas" en vez de mezclarlos con foto-precio/
// foto-descripcion/mi-plantilla, que son configuraciones más libres, no una composición fija.
export const PRESETS_COMPOSICION = Object.freeze([
  'banner-inferior',
  'editorial',
  'polaroid',
  'story-inmersiva',
  'novedad',
  'ficha-natural',
]);

// --- Datos de marca de los 4 presets (ronda 2026-09-29): "Nombre del negocio" (vacío = no se
// dibuja) y "Texto del botón/llamado" de "Banner inferior", editables en Ajustes generales (pantalla
// Plantilla). Son ajustes GENERALES (uno solo para toda la app), no por estilo: los 4 mocks los usan
// fijos para todos los presets, no tiene sentido pedirlos 4 veces. ---
export const NOMBRE_NEGOCIO_POR_DEFECTO = '';
export const TEXTO_BOTON_POR_DEFECTO = 'Pedir por privado';

/** Nombre de la PRIMERA sección del producto (la que sirve de "etiqueta/colección" en los 4
 * presets), o `''` si no tiene ninguna o la/s que tiene ya no existen. Pura: recibe la colección de
 * secciones ya cargada (id→nombre), no toca IndexedDB. */
export function resolverSeccionNombre(producto, secciones) {
  const ids = seccionesDelProducto(producto);
  if (!ids.length) return '';
  const porId = new Map((secciones ?? []).map((s) => [s.id, s.nombre]));
  return porId.get(ids[0]) ?? '';
}

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
    // Campo agregado en la ronda "secciones": opcional, un respaldo viejo no lo trae y queda `[]`
    // al importar (ver `repositorio.importarRespaldo`).
    if (p.secciones != null && (!Array.isArray(p.secciones) || p.secciones.some((s) => typeof s !== 'string')))
      return { ok: false, error: `Producto #${i + 1} con secciones inválidas.` };
  }

  // `secciones` (la colección, no la del producto): opcional por la misma razón.
  if (objeto.secciones != null) {
    if (!Array.isArray(objeto.secciones)) return { ok: false, error: 'Las secciones del respaldo son inválidas.' };
    for (const [i, s] of objeto.secciones.entries()) {
      if (!s || typeof s !== 'object') return { ok: false, error: `Sección #${i + 1} inválida.` };
      if (typeof s.id !== 'string' || !s.id) return { ok: false, error: `Sección #${i + 1} sin id.` };
      if (typeof s.nombre !== 'string' || !s.nombre.trim()) return { ok: false, error: `Sección #${i + 1} sin nombre.` };
    }
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
    // Campo agregado en la ronda "calidad de imagen" (Fase 2): opcional, un respaldo viejo no lo
    // trae y queda en el valor por defecto ('estandar') al importar.
    if (objeto.general.calidadImagen != null && !CALIDADES_IMAGEN.includes(objeto.general.calidadImagen))
      return { ok: false, error: 'Calidad de imagen inválida en el respaldo.' };
    if (objeto.general.nombreNegocio != null && typeof objeto.general.nombreNegocio !== 'string')
      return { ok: false, error: 'Nombre del negocio inválido en el respaldo.' };
    if (typeof objeto.general.nombreNegocio === 'string' && objeto.general.nombreNegocio.length > 60)
      return { ok: false, error: 'Nombre del negocio demasiado largo (máx. 60).' };
    if (objeto.general.textoBoton != null && typeof objeto.general.textoBoton !== 'string')
      return { ok: false, error: 'Texto del botón inválido en el respaldo.' };
    if (typeof objeto.general.textoBoton === 'string' && objeto.general.textoBoton.length > 40)
      return { ok: false, error: 'Texto del botón demasiado largo (máx. 40).' };
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
export function construirRespaldo({ productos, plantilla, general, secciones }) {
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
      secciones: seccionesDelProducto(p),
      creado: p.creado,
      actualizado: p.actualizado,
    })),
    // Colección de secciones (etiquetas): un respaldo viejo no la trae, `importarRespaldo` la deja
    // en `[]`. Va con `orden` para poder reconstruir el mismo orden al importar.
    secciones: (secciones ?? []).map((s) => ({ id: s.id, nombre: s.nombre, orden: s.orden ?? 0 })),
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
          calidadImagen: general.calidadImagen ?? CALIDAD_IMAGEN_POR_DEFECTO,
          nombreNegocio: general.nombreNegocio ?? NOMBRE_NEGOCIO_POR_DEFECTO,
          textoBoton: general.textoBoton ?? TEXTO_BOTON_POR_DEFECTO,
          plantillasFavoritas: Array.isArray(general.plantillasFavoritas) ? general.plantillasFavoritas : [],
        }
      : null,
  };
}

export function generarId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `p_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// --- Secciones: etiquetas tipo "Lunes"/"Lencería", un producto puede estar en VARIAS (ronda
// "secciones") ---

/** Pseudo-id del grupo/filtro "Sin sección" (nunca se guarda: no es una sección real). */
export const ID_SIN_SECCION = 'sin-seccion';

/** Valida el nombre de una sección antes de crearla/renombrarla. */
export function validarNombreSeccion(nombre) {
  const limpio = String(nombre ?? '').trim();
  if (!limpio) return { ok: false, error: 'Poné un nombre para la sección.' };
  if (limpio.length > 40) return { ok: false, error: 'Máximo 40 caracteres.' };
  return { ok: true, error: null };
}

/** Un producto normalizado siempre tiene `secciones` como array (respaldos/registros de antes de
 * esta ronda no lo tienen: se completa con `[]`, nunca `undefined`). */
export function seccionesDelProducto(producto) {
  return Array.isArray(producto?.secciones) ? producto.secciones : [];
}

/**
 * Agrupa `productos` por sección, en el ORDEN de `secciones` (ya ordenadas por quien llama), y
 * agrega al final un grupo "Sin sección" con los que no tienen ninguna asignada. Un producto en 2+
 * secciones aparece en cada grupo que le corresponde — es el MISMO objeto en los dos arrays (no una
 * copia), así que su casilla queda sincronizada: cambiarla en un grupo cambia el mismo `producto`
 * que se lee en el otro.
 */
export function agruparProductosPorSeccion(productos, secciones) {
  const grupos = secciones.map((s) => ({ id: s.id, nombre: s.nombre, productos: [] }));
  const porId = new Map(grupos.map((g) => [g.id, g]));
  const sinSeccion = [];
  for (const producto of productos) {
    const ids = seccionesDelProducto(producto).filter((id) => porId.has(id));
    if (ids.length === 0) {
      sinSeccion.push(producto);
    } else {
      for (const id of ids) porId.get(id).productos.push(producto);
    }
  }
  return [...grupos, { id: null, nombre: 'Sin sección', productos: sinSeccion }];
}

/** Cuenta productos por sección (+ total y "sin sección") para los chips del filtro. */
export function contarProductosPorSeccion(productos, secciones) {
  const porSeccion = new Map(secciones.map((s) => [s.id, 0]));
  let sinSeccion = 0;
  for (const producto of productos) {
    const ids = seccionesDelProducto(producto).filter((id) => porSeccion.has(id));
    if (ids.length === 0) sinSeccion += 1;
    for (const id of ids) porSeccion.set(id, porSeccion.get(id) + 1);
  }
  return { todas: productos.length, porSeccion, sinSeccion };
}

/** Productos visibles según el filtro elegido ('todas', un id de sección, o `ID_SIN_SECCION`). */
export function filtrarProductosPorSeccion(productos, filtro) {
  if (!filtro || filtro === 'todas') return productos;
  if (filtro === ID_SIN_SECCION) return productos.filter((p) => seccionesDelProducto(p).length === 0);
  return productos.filter((p) => seccionesDelProducto(p).includes(filtro));
}
