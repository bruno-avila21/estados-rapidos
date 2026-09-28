// Generador de QR propio (js/utils/qr.js): sin decodificador disponible offline para comparar el
// contenido bit a bit, así que se verifica contra reglas ESTRUCTURALES de la especificación
// ISO/IEC 18004 (fijas, no dependen de los datos) y contra la tabla oficial de capacidades por
// versión/nivel de corrección (un "vector conocido" publicado, no inventado) — ver js/utils/qr.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generarMatrizQR } from '../js/utils/qr.js';

test('generarMatrizQR: los 3 patrones de posición (finder) están en las 3 esquinas correctas', () => {
  const m = generarMatrizQR('https://bruno-avila21.github.io/estados-rapidos/', { correccion: 'M' });
  const n = m.length;

  // Patrón de 7x7: anillo exterior oscuro, anillo intermedio claro, centro 3x3 oscuro.
  function esFinder(filaBase, colBase) {
    for (let r = 0; r < 7; r += 1) {
      for (let c = 0; c < 7; c += 1) {
        const esperadoOscuro = r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        if (m[filaBase + r][colBase + c] !== esperadoOscuro) return false;
      }
    }
    return true;
  }

  assert.ok(esFinder(0, 0), 'finder arriba-izquierda');
  assert.ok(esFinder(0, n - 7), 'finder arriba-derecha');
  assert.ok(esFinder(n - 7, 0), 'finder abajo-izquierda');
});

test('generarMatrizQR: el módulo oscuro fijo de la especificación está encendido', () => {
  // ISO/IEC 18004: el módulo en (moduleCount-8, 8) siempre está oscuro, sin importar los datos.
  const m = generarMatrizQR('hola', { correccion: 'M' });
  const n = m.length;
  assert.equal(m[n - 8][8], true);
});

test('generarMatrizQR: el patrón de sincronismo (fila/columna 6) alterna oscuro/claro', () => {
  const m = generarMatrizQR('hola mundo', { correccion: 'M' });
  const n = m.length;
  for (let c = 8; c < n - 8; c += 1) {
    assert.equal(m[6][c], c % 2 === 0, `columna ${c} del patrón de sincronismo`);
  }
});

test('generarMatrizQR: elige la versión más chica según la tabla OFICIAL de capacidades (byte, nivel M)', () => {
  // Capacidades máximas en bytes, nivel M, versiones 1 a 10 (ISO/IEC 18004): un texto de esa
  // longitud exacta tiene que entrar en esa versión (moduleCount = 4*version + 17); uno más largo
  // pasa a la siguiente.
  const capacidadesM = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  for (let version = 1; version <= 10; version += 1) {
    const texto = 'a'.repeat(capacidadesM[version - 1]);
    const m = generarMatrizQR(texto, { correccion: 'M' });
    assert.equal(m.length, 4 * version + 17, `versión ${version}, texto de ${texto.length} bytes`);
  }
  // uno más largo que la capacidad de la versión 1 ya no entra en la versión 1.
  const textoV2 = 'a'.repeat(capacidadesM[0] + 1);
  const m2 = generarMatrizQR(textoV2, { correccion: 'M' });
  assert.equal(m2.length, 4 * 2 + 17);
});

test('generarMatrizQR: es determinística (mismo texto -> misma matriz)', () => {
  const a = generarMatrizQR('estados-rapidos', { correccion: 'M' });
  const b = generarMatrizQR('estados-rapidos', { correccion: 'M' });
  assert.deepEqual(a, b);
});

test('generarMatrizQR: textos distintos dan matrices distintas', () => {
  const a = generarMatrizQR('https://a.example', { correccion: 'M' });
  const b = generarMatrizQR('https://b.example', { correccion: 'M' });
  assert.notDeepEqual(a, b);
});

test('generarMatrizQR: matriz cuadrada, tamaño 21 + 4*(version-1), y todo booleano', () => {
  const m = generarMatrizQR('X', { correccion: 'M' });
  assert.equal(m.length, 21); // "X" es 1 byte: entra de sobra en la versión 1 (21x21)
  for (const fila of m) {
    assert.equal(fila.length, m.length);
    for (const modulo of fila) assert.equal(typeof modulo, 'boolean');
  }
});

test('generarMatrizQR: sin texto, tira error en vez de generar un QR vacío', () => {
  assert.throws(() => generarMatrizQR(''));
});

test('generarMatrizQR: nivel de corrección inválido, tira error', () => {
  assert.throws(() => generarMatrizQR('hola', { correccion: 'X' }));
});
