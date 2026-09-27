import { test } from 'node:test';
import assert from 'node:assert/strict';
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

test('resolverEstilo: los 4 estilos declarados son válidos', () => {
  assert.equal(ESTILOS_IMAGEN.length, 4);
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
