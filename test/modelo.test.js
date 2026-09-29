import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REGISTRO_FUENTES } from '../js/fuentes.js';
import {
  formatearPrecio,
  parsearPrecio,
  validarProducto,
  validarRespaldo,
  construirRespaldo,
  resolverEstilo,
  aplicarPlantillaDescripcion,
  resolverDescripcion,
  ESTILOS_IMAGEN,
  ESTILO_POR_DEFECTO,
  DESCRIPCION_MODELO_POR_DEFECTO,
  AJUSTES_POR_DEFECTO,
  normalizarAjustes,
  ESTILOS_CON_AJUSTES,
  AJUSTES_POR_DEFECTO_POR_ESTILO,
  normalizarAjustesPorEstilo,
  migrarAjustesPorEstilo,
  esAjustePersonalizado,
  PRESETS_FONDO_TEXTO,
  aplicarPresetFondo,
  CALIDADES_IMAGEN,
  CALIDAD_IMAGEN_POR_DEFECTO,
  resolverOpcionesExportacion,
  ETIQUETA_ESTILO,
  PRESETS_COMPOSICION,
  FUENTES_DISPONIBLES,
} from '../js/modelo.js';

test('formatearPrecio: miles es-AR, sin decimales por defecto', () => {
  assert.equal(formatearPrecio(12500), '$ 12.500');
  assert.equal(formatearPrecio(1000000), '$ 1.000.000');
});

test('formatearPrecio: con decimales', () => {
  assert.equal(formatearPrecio(1250.5, { decimales: true }), '$ 1.250,50');
});

test('formatearPrecio: sin separador de miles', () => {
  assert.equal(formatearPrecio(12500, { separadorMiles: false }), '$ 12500');
});

test('formatearPrecio: prefijo configurable', () => {
  assert.equal(formatearPrecio(12500, { prefijo: 'ARS ' }), 'ARS 12.500');
});

test('formatearPrecio: sin precio (null/undefined/negativo/0/NaN) da cadena vacía, nunca "$ 0" (precio opcional)', () => {
  assert.equal(formatearPrecio(null), '');
  assert.equal(formatearPrecio(undefined), '');
  assert.equal(formatearPrecio(-50), '');
  assert.equal(formatearPrecio(0), '');
  assert.equal(formatearPrecio(NaN), '');
});

test('parsearPrecio: admite formatos con y sin separadores', () => {
  assert.equal(parsearPrecio('12.500'), 12500);
  assert.equal(parsearPrecio('12500'), 12500);
  assert.equal(parsearPrecio('$ 12.500'), 12500);
  assert.equal(parsearPrecio('1250,50'), 1250.5);
});

test('parsearPrecio: vacío o no numérico da NaN, negativo preserva el signo (QA.md #8)', () => {
  // a propósito NO clampea: la validación es responsabilidad de validarProducto, para no
  // guardar un precio inválido en silencio como "$ 0".
  assert.ok(Number.isNaN(parsearPrecio('')));
  assert.ok(Number.isNaN(parsearPrecio('abc')));
  assert.equal(parsearPrecio('-500'), -500);
});

test('validarProducto: nombre obligatorio, precio negativo inválido', () => {
  const { ok, errores } = validarProducto({ nombre: '', precio: -1 });
  assert.equal(ok, false);
  assert.ok(errores.nombre);
  assert.ok(errores.precio);
});

test('validarProducto: precio OPCIONAL — null/undefined es válido (producto sin precio)', () => {
  assert.equal(validarProducto({ nombre: 'x', precio: null }).ok, true);
  assert.equal(validarProducto({ nombre: 'x', precio: undefined }).ok, true);
  assert.equal(validarProducto({ nombre: 'x' }).ok, true);
});

test('validarProducto: si se carga un precio, tiene que ser mayor a cero', () => {
  assert.equal(validarProducto({ nombre: 'x', precio: NaN }).ok, false);
  assert.equal(validarProducto({ nombre: 'x', precio: 0 }).ok, false);
  assert.equal(validarProducto({ nombre: 'x', precio: -5 }).ok, false);
  assert.equal(validarProducto({ nombre: 'x', precio: 1 }).ok, true);
});

test('validarProducto: producto válido', () => {
  const { ok, errores } = validarProducto({ nombre: 'Remera', precio: 9990, descripcion: 'Talle M' });
  assert.equal(ok, true);
  assert.deepEqual(errores, {});
});

test('validarProducto: nombre demasiado largo', () => {
  const { ok, errores } = validarProducto({ nombre: 'a'.repeat(90), precio: 10 });
  assert.equal(ok, false);
  assert.ok(errores.nombre);
});

test('validarRespaldo: rechaza versión desconocida', () => {
  const { ok, error } = validarRespaldo({ version: 99, productos: [] });
  assert.equal(ok, false);
  assert.match(error, /versión/i);
});

test('validarRespaldo: rechaza si falta productos', () => {
  const { ok } = validarRespaldo({ version: 1 });
  assert.equal(ok, false);
});

test('validarRespaldo: acepta un respaldo bien formado', () => {
  const respaldo = construirRespaldo({
    productos: [{ id: 'p1', nombre: 'Remera', precio: 9990, descripcion: '', fotoBase64: null }],
    plantilla: null,
  });
  const { ok, error } = validarRespaldo(respaldo);
  assert.equal(ok, true, error);
});

test('validarRespaldo: acepta un producto sin precio (precio: null)', () => {
  const respaldo = construirRespaldo({
    productos: [{ id: 'p1', nombre: 'Consulta', precio: null, descripcion: '', fotoBase64: null }],
    plantilla: null,
  });
  const { ok, error } = validarRespaldo(respaldo);
  assert.equal(ok, true, error);
});

test('validarRespaldo: rechaza producto sin id', () => {
  const { ok } = validarRespaldo({ version: 1, productos: [{ nombre: 'x', precio: 1 }] });
  assert.equal(ok, false);
});

test('construirRespaldo → validarRespaldo: ida y vuelta', () => {
  const productos = [
    { id: 'a', nombre: 'Pantalón', precio: 15000, descripcion: 'Azul', fotoBase64: null, creado: '2026-01-01', actualizado: '2026-01-01' },
    { id: 'b', nombre: 'Campera', precio: 45000, descripcion: '', fotoBase64: 'data:image/jpeg;base64,AAA=', creado: '2026-01-02', actualizado: '2026-01-02' },
  ];
  const plantilla = { imagenBase64: null, ajustes: { foto: { x: 0, y: 0, w: 10, h: 10 } }, formatoPrecio: { prefijo: '$ ' } };
  const respaldo = construirRespaldo({ productos, plantilla });
  assert.equal(respaldo.version, 1);
  assert.equal(respaldo.productos.length, 2);
  const { ok } = validarRespaldo(respaldo);
  assert.equal(ok, true);
  assert.equal(JSON.parse(JSON.stringify(respaldo)).productos[1].nombre, 'Campera');
});

// --- Estilo de imagen + descripción modelo (cambio de producto 2026-09-27) ---

test('resolverEstilo: usa el override del producto si es válido', () => {
  assert.equal(resolverEstilo({ estilo: 'foto-precio' }, { estiloGeneral: 'solo-foto' }), 'foto-precio');
});

test('resolverEstilo: sin override, usa el general', () => {
  assert.equal(resolverEstilo({ estilo: null }, { estiloGeneral: 'mi-plantilla' }), 'mi-plantilla');
  assert.equal(resolverEstilo({}, {}), ESTILO_POR_DEFECTO);
});

test('resolverEstilo: ignora un override u estiloGeneral inválido (dato corrupto)', () => {
  assert.equal(resolverEstilo({ estilo: 'no-existe' }, { estiloGeneral: 'foto-precio' }), 'foto-precio');
  assert.equal(resolverEstilo({}, { estiloGeneral: 'tampoco-existe' }), ESTILO_POR_DEFECTO);
});

test('resolverEstilo: los 8 estilos declarados son válidos (4 de siempre + 4 presets de composición, Fase 4)', () => {
  assert.equal(ESTILOS_IMAGEN.length, 8);
  for (const estilo of ESTILOS_IMAGEN) {
    assert.equal(resolverEstilo({ estilo }, {}), estilo);
  }
});

test('aplicarPlantillaDescripcion: reemplaza los 3 marcadores', () => {
  const resultado = aplicarPlantillaDescripcion('{nombre} a {precio} — {descripcion}', {
    nombre: 'Remera',
    precio: '$ 12.500',
    descripcion: 'talle M',
  });
  assert.equal(resultado, 'Remera a $ 12.500 — talle M');
});

test('aplicarPlantillaDescripcion: marcador repetido se reemplaza todas las veces', () => {
  const resultado = aplicarPlantillaDescripcion('{nombre}! Sí, {nombre}!', { nombre: 'Oferta', precio: '', descripcion: '' });
  assert.equal(resultado, 'Oferta! Sí, Oferta!');
});

test('aplicarPlantillaDescripcion: sin plantilla, usa el modelo por defecto', () => {
  const resultado = aplicarPlantillaDescripcion(null, { nombre: 'Gorra', precio: '$ 8.000', descripcion: '' });
  assert.equal(resultado, aplicarPlantillaDescripcion(DESCRIPCION_MODELO_POR_DEFECTO, { nombre: 'Gorra', precio: '$ 8.000', descripcion: '' }));
});

test('resolverDescripcion: producto con descripción propia la usa tal cual (sin aplicar el modelo)', () => {
  const producto = { nombre: 'Campera', precio: 45000, descripcion: 'Talle único, azul' };
  assert.equal(resolverDescripcion(producto, { descripcionModelo: '{nombre} baratísimo' }), 'Talle único, azul');
});

test('resolverDescripcion: sin descripción propia, aplica el modelo con el precio formateado', () => {
  const producto = { nombre: 'Campera', precio: 45000, descripcion: '' };
  const resultado = resolverDescripcion(producto, {
    descripcionModelo: '{nombre} a {precio} 🔥',
    formatoPrecio: { prefijo: '$ ', separadorMiles: true, decimales: false },
  });
  assert.equal(resultado, 'Campera a $ 45.000 🔥');
});

// --- Precio opcional: el marcador {precio} se limpia sin dejar conectores colgando ---

test('aplicarPlantillaDescripcion: sin precio, saca el marcador y el conector inmediato ("a")', () => {
  const resultado = aplicarPlantillaDescripcion('{nombre} a {precio} 🔥 Pedilo por privado', {
    nombre: 'Remera',
    precio: '',
    descripcion: '',
  });
  assert.equal(resultado, 'Remera 🔥 Pedilo por privado');
  assert.doesNotMatch(resultado, /\ba\b/); // no queda ningún "a" colgando
});

test('aplicarPlantillaDescripcion: sin precio, también limpia "por"/"de"/"en" antes del marcador', () => {
  assert.equal(aplicarPlantillaDescripcion('{nombre} por {precio}', { nombre: 'X', precio: '' }), 'X');
  assert.equal(aplicarPlantillaDescripcion('{nombre} de {precio}', { nombre: 'X', precio: '' }), 'X');
  assert.equal(aplicarPlantillaDescripcion('{nombre} en {precio}', { nombre: 'X', precio: '' }), 'X');
});

test('aplicarPlantillaDescripcion: sin precio y sin conector reconocido, igual saca el marcador', () => {
  const resultado = aplicarPlantillaDescripcion('{nombre}: {precio}', { nombre: 'Remera', precio: '' });
  assert.doesNotMatch(resultado, /\{precio\}/);
});

test('resolverDescripcion: producto sin precio no deja "a $" colgando en el modelo por defecto', () => {
  const producto = { nombre: 'Remera', precio: null, descripcion: '' };
  const resultado = resolverDescripcion(producto, {});
  assert.equal(resultado, 'Remera 🔥 Pedilo por privado');
});

// --- Ajustes compartidos (nombre/precio/descripción) y compatibilidad con respaldos viejos ---

test('normalizarAjustes: sin nada guardado, devuelve los valores por defecto', () => {
  const resultado = normalizarAjustes(null);
  assert.deepEqual(resultado.nombre, AJUSTES_POR_DEFECTO.nombre);
  assert.deepEqual(resultado.descripcion, AJUSTES_POR_DEFECTO.descripcion);
});

test('normalizarAjustes: un respaldo viejo (sin descripcion ni familia/fondo) sigue importando', () => {
  const ajustesViejos = {
    foto: { x: 10, y: 10, w: 500, h: 500, modo: 'cover' },
    nombre: { x: 60, y: 900, w: 900, h: 100, tamano: 60, color: '#fff', peso: 700, alineacion: 'center' },
    precio: { x: 60, y: 1000, w: 900, h: 100, tamano: 80, color: '#f5a623', peso: 800, alineacion: 'center' },
    // sin "descripcion": no existía antes del 2026-09-27
  };
  const resultado = normalizarAjustes(ajustesViejos);
  assert.equal(resultado.nombre.x, 60); // se preservó lo guardado
  assert.equal(resultado.nombre.familia, AJUSTES_POR_DEFECTO.nombre.familia); // se completó lo que faltaba
  assert.deepEqual(resultado.descripcion, AJUSTES_POR_DEFECTO.descripcion); // caja nueva, default completo
});

// --- Ajustes POR ESTILO (ronda 2026-09-28): defaults propios, detección de "Personalizado" y
// migración de un config/respaldo viejo (ajustes compartidos) al formato nuevo ---

test('AJUSTES_POR_DEFECTO_POR_ESTILO: foto-precio arranca con nombre y precio visibles, descripción oculta', () => {
  const d = AJUSTES_POR_DEFECTO_POR_ESTILO['foto-precio'];
  assert.equal(d.nombre.visible, true);
  assert.equal(d.precio.visible, true);
  assert.equal(d.descripcion.visible, false);
});

test('AJUSTES_POR_DEFECTO_POR_ESTILO: foto-descripcion arranca con SOLO la descripción visible', () => {
  const d = AJUSTES_POR_DEFECTO_POR_ESTILO['foto-descripcion'];
  assert.equal(d.nombre.visible, false);
  assert.equal(d.precio.visible, false);
  assert.equal(d.descripcion.visible, true);
});

test('AJUSTES_POR_DEFECTO_POR_ESTILO: mi-plantilla arranca con foto, nombre y precio visibles, descripción oculta', () => {
  const d = AJUSTES_POR_DEFECTO_POR_ESTILO['mi-plantilla'];
  assert.equal(d.foto.visible, true);
  assert.equal(d.nombre.visible, true);
  assert.equal(d.precio.visible, true);
  assert.equal(d.descripcion.visible, false);
});

test('AJUSTES_POR_DEFECTO_POR_ESTILO: tiene exactamente los estilos con texto (los 3 de siempre + los 4 presets de composición), no "solo-foto"', () => {
  assert.deepEqual(Object.keys(AJUSTES_POR_DEFECTO_POR_ESTILO).sort(), [...ESTILOS_CON_AJUSTES].sort());
  assert.equal(ESTILOS_CON_AJUSTES.includes('solo-foto'), false);
});

test('normalizarAjustesPorEstilo: sin nada guardado, cada estilo con sus propios defaults', () => {
  const resultado = normalizarAjustesPorEstilo(null);
  for (const estilo of ESTILOS_CON_AJUSTES) {
    assert.deepEqual(resultado[estilo], AJUSTES_POR_DEFECTO_POR_ESTILO[estilo]);
  }
});

test('normalizarAjustesPorEstilo: completa un estilo con cajas parciales contra SUS defaults (no los de otro estilo)', () => {
  const resultado = normalizarAjustesPorEstilo({ 'foto-precio': { nombre: { x: 5 } } });
  assert.equal(resultado['foto-precio'].nombre.x, 5); // se preservó
  assert.equal(resultado['foto-precio'].nombre.visible, true); // completado con el default de foto-precio
  assert.deepEqual(resultado['foto-descripcion'], AJUSTES_POR_DEFECTO_POR_ESTILO['foto-descripcion']);
});

test('migrarAjustesPorEstilo: sin config guardada, defaults de cada estilo', () => {
  const resultado = migrarAjustesPorEstilo(null);
  assert.deepEqual(resultado, normalizarAjustesPorEstilo(null));
});

test('migrarAjustesPorEstilo: ya viene en formato nuevo (ajustesPorEstilo), se normaliza tal cual', () => {
  const guardado = { ajustesPorEstilo: { 'mi-plantilla': { nombre: { x: 77 } } } };
  const resultado = migrarAjustesPorEstilo(guardado);
  assert.equal(resultado['mi-plantilla'].nombre.x, 77);
});

test('migrarAjustesPorEstilo: formato VIEJO (ajustes compartido) se copia a los 3 estilos de siempre, conservando lo hecho', () => {
  const ajustesViejos = {
    foto: { x: 10, y: 10, w: 500, h: 500, modo: 'cover' },
    nombre: { x: 321, y: 900, w: 900, h: 100, tamano: 60, color: '#fff', peso: 700, alineacion: 'center' },
    precio: { x: 60, y: 1000, w: 900, h: 100, tamano: 80, color: '#f5a623', peso: 800, alineacion: 'center' },
  };
  const resultado = migrarAjustesPorEstilo({ ajustes: ajustesViejos });
  for (const estilo of ['foto-precio', 'foto-descripcion', 'mi-plantilla']) {
    assert.equal(resultado[estilo].nombre.x, 321); // lo que el usuario ya había movido, conservado
  }
  // los 3 quedan IGUALES entre sí justo después de migrar (recién divergen si el usuario edita).
  assert.deepEqual(resultado['foto-precio'], resultado['foto-descripcion']);
  assert.deepEqual(resultado['foto-precio'], resultado['mi-plantilla']);
  // los 4 presets de composición (Fase 4) no existían en este respaldo viejo: no hay nada que
  // copiarles, arrancan con sus propios defaults de fábrica (no quedan ausentes).
  for (const preset of ['banner-inferior', 'editorial', 'polaroid', 'story-inmersiva']) {
    assert.deepEqual(resultado[preset], AJUSTES_POR_DEFECTO_POR_ESTILO[preset]);
  }
});

test('esAjustePersonalizado: false contra los defaults de fábrica, true apenas se cambia algo', () => {
  assert.equal(esAjustePersonalizado('foto-precio', AJUSTES_POR_DEFECTO_POR_ESTILO['foto-precio']), false);
  const modificado = { ...AJUSTES_POR_DEFECTO_POR_ESTILO['foto-precio'], nombre: { ...AJUSTES_POR_DEFECTO_POR_ESTILO['foto-precio'].nombre, x: 999 } };
  assert.equal(esAjustePersonalizado('foto-precio', modificado), true);
});

test('esAjustePersonalizado: estilo desconocido o ajustes ausentes no revienta, da false', () => {
  assert.equal(esAjustePersonalizado('no-existe', {}), false);
  assert.equal(esAjustePersonalizado('foto-precio', null), false);
});

// --- Presets de fondo de texto (Fase 2, "S" #3) ---

test('PRESETS_FONDO_TEXTO: hay más de uno y cada uno trae color, opacidad y radio', () => {
  assert.ok(PRESETS_FONDO_TEXTO.length >= 3);
  for (const preset of PRESETS_FONDO_TEXTO) {
    assert.equal(typeof preset.id, 'string');
    assert.equal(typeof preset.nombre, 'string');
    assert.match(preset.fondoColor, /^#[0-9a-f]{6}$/i);
    assert.ok(preset.fondoOpacidad >= 0 && preset.fondoOpacidad <= 1);
    assert.ok(preset.fondoRadio >= 0);
  }
});

test('aplicarPresetFondo: pisa color/opacidad/radio de la caja, sin tocar posición/tipografía', () => {
  const caja = { x: 60, y: 1460, w: 960, h: 120, tamano: 58, familia: 'inter', fondoColor: '#111111', fondoOpacidad: 0.2, fondoRadio: 2 };
  const preset = PRESETS_FONDO_TEXTO.find((p) => p.id === 'lino-claro');
  const resultado = aplicarPresetFondo(caja, 'lino-claro');
  assert.equal(resultado.fondoColor, preset.fondoColor);
  assert.equal(resultado.fondoOpacidad, preset.fondoOpacidad);
  assert.equal(resultado.fondoRadio, preset.fondoRadio);
  // el resto de la caja no se toca
  assert.equal(resultado.x, 60);
  assert.equal(resultado.tamano, 58);
  assert.equal(resultado.familia, 'inter');
});

test('aplicarPresetFondo: pura (no muta la caja recibida) y devuelve un objeto nuevo', () => {
  const caja = { fondoColor: '#000000', fondoOpacidad: 1, fondoRadio: 0 };
  const resultado = aplicarPresetFondo(caja, 'acento');
  assert.notEqual(resultado, caja);
  assert.equal(caja.fondoColor, '#000000'); // el original queda intacto
});

test('aplicarPresetFondo: id desconocido o caja ausente no revienta, devuelve la caja tal cual', () => {
  const caja = { fondoColor: '#abcdef' };
  assert.equal(aplicarPresetFondo(caja, 'no-existe'), caja);
  assert.equal(aplicarPresetFondo(null, 'acento'), null);
});

// --- Calidad de imagen al exportar (Fase 2, "S" #5) ---

test('resolverOpcionesExportacion: "estandar" es JPEG 0.85, "alta" es JPEG 0.95', () => {
  assert.deepEqual(resolverOpcionesExportacion('estandar'), { formato: 'image/jpeg', calidad: 0.85 });
  assert.deepEqual(resolverOpcionesExportacion('alta'), { formato: 'image/jpeg', calidad: 0.95 });
});

test('resolverOpcionesExportacion: valor inválido o ausente cae a la calidad por defecto (estandar)', () => {
  assert.deepEqual(resolverOpcionesExportacion(undefined), resolverOpcionesExportacion(CALIDAD_IMAGEN_POR_DEFECTO));
  assert.deepEqual(resolverOpcionesExportacion('ultra'), resolverOpcionesExportacion(CALIDAD_IMAGEN_POR_DEFECTO));
  assert.equal(CALIDAD_IMAGEN_POR_DEFECTO, 'estandar');
});

test('CALIDADES_IMAGEN: exactamente "estandar" y "alta"', () => {
  assert.deepEqual([...CALIDADES_IMAGEN].sort(), ['alta', 'estandar']);
});

test('validarRespaldo: acepta calidadImagen válida y rechaza un valor inventado', () => {
  const base = construirRespaldo({ productos: [], plantilla: null, general: { calidadImagen: 'alta' } });
  assert.equal(validarRespaldo(base).ok, true);
  const corrupto = { ...base, general: { ...base.general, calidadImagen: 'ultra-hd' } };
  const { ok, error } = validarRespaldo(corrupto);
  assert.equal(ok, false);
  assert.match(error, /calidad/i);
});

test('construirRespaldo: sin calidadImagen explícita, guarda el valor por defecto (compatibilidad con respaldos viejos)', () => {
  const respaldo = construirRespaldo({ productos: [], plantilla: null, general: {} });
  assert.equal(respaldo.general.calidadImagen, CALIDAD_IMAGEN_POR_DEFECTO);
});

// --- Presets de composición (Fase 4, "catálogo de presets"): banner inferior/editorial/polaroid/
// story inmersiva. Mismo mecanismo de siempre (ESTILOS_IMAGEN/ESTILOS_CON_AJUSTES/
// AJUSTES_POR_DEFECTO_POR_ESTILO), solo que la posición de partida de sus cajas sale de las
// funciones puras de geometria-presets.js en vez de un número fijo a mano.

test('PRESETS_COMPOSICION: los 4 presets son también estilos de imagen editables', () => {
  assert.deepEqual([...PRESETS_COMPOSICION].sort(), ['banner-inferior', 'editorial', 'polaroid', 'story-inmersiva'].sort());
  for (const preset of PRESETS_COMPOSICION) {
    assert.ok(ESTILOS_IMAGEN.includes(preset));
    assert.ok(ESTILOS_CON_AJUSTES.includes(preset));
    assert.equal(typeof ETIQUETA_ESTILO[preset], 'string');
  }
});

test('AJUSTES_POR_DEFECTO_POR_ESTILO: los 4 presets de composición arrancan con nombre+precio+descripción visibles y la foto oculta (va a una zona fija propia)', () => {
  for (const preset of PRESETS_COMPOSICION) {
    const d = AJUSTES_POR_DEFECTO_POR_ESTILO[preset];
    assert.equal(d.nombre.visible, true, preset);
    assert.equal(d.precio.visible, true, preset);
    assert.equal(d.descripcion.visible, true, preset);
    assert.equal(d.foto.visible, false, preset);
  }
});

test('AJUSTES_POR_DEFECTO_POR_ESTILO: los 4 presets de composición truncan con elipsis (geometría fija, no clip)', () => {
  for (const preset of PRESETS_COMPOSICION) {
    const d = AJUSTES_POR_DEFECTO_POR_ESTILO[preset];
    assert.equal(d.nombre.elipsis, true, preset);
    assert.equal(d.descripcion.elipsis, true, preset);
  }
});

// Ronda 2026-09-29 ("presets calzan con los mocks"): los 4 presets de composición dejan de usar
// las 6 tipografías OFL ELEGIBLES a mano en el editor (`FUENTES_DISPONIBLES`) — cada mock Stitch usa
// Newsreader (serif de títulos/precio) + Manrope (sans de cuerpo/etiquetas), FIJAS por diseño, igual
// que la franja/marco/tarjeta/scrim tampoco son editables. El test verifica contra el registro REAL
// de fuentes cargables en canvas (`fuentes.js`), no contra la lista de elegibles: así sigue
// detectando un typo de familia inexistente, solo que ya no exige que sea una de las 6 de siempre.
test('AJUSTES_POR_DEFECTO_POR_ESTILO: los 4 presets de composición usan tipografía real (Newsreader/Manrope fijos, no elegibles)', () => {
  for (const preset of PRESETS_COMPOSICION) {
    const d = AJUSTES_POR_DEFECTO_POR_ESTILO[preset];
    for (const clave of ['nombre', 'precio', 'descripcion']) {
      const familia = d[clave].familia;
      assert.ok(REGISTRO_FUENTES[familia], `${preset}.${clave}.familia ("${familia}") no está en el registro de fuentes de canvas`);
      assert.ok(!FUENTES_DISPONIBLES.includes(familia), `${preset}.${clave}.familia ("${familia}") debería ser Newsreader/Manrope, no una de las 6 elegibles`);
    }
  }
});

test('esAjustePersonalizado: también funciona con los 4 presets de composición', () => {
  for (const preset of PRESETS_COMPOSICION) {
    assert.equal(esAjustePersonalizado(preset, AJUSTES_POR_DEFECTO_POR_ESTILO[preset]), false);
    const modificado = {
      ...AJUSTES_POR_DEFECTO_POR_ESTILO[preset],
      nombre: { ...AJUSTES_POR_DEFECTO_POR_ESTILO[preset].nombre, tamano: 999 },
    };
    assert.equal(esAjustePersonalizado(preset, modificado), true);
  }
});
