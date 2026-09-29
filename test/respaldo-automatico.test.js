// Lógica pura de la copia automática diaria (js/respaldo-automatico.js): CUÁNDO toca copiar, cómo
// se nombra el archivo y qué archivos rotar para conservar como máximo 7. Es la especificación que
// `PuenteArchivos.kt` (rotarCopiasAutomaticas) reimplementa en Kotlin del lado nativo.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tocaCopiarAutomatica, nombreArchivoRespaldo, nombresARotar, VENTANA_COPIA_AUTOMATICA_MS } from '../js/respaldo-automatico.js';

// --- tocaCopiarAutomatica ---

test('tocaCopiarAutomatica: false si la preferencia está apagada, aunque nunca se haya copiado', () => {
  assert.equal(tocaCopiarAutomatica({ habilitada: false, ultimaCopia: null }), false);
  assert.equal(tocaCopiarAutomatica({ habilitada: false, ultimaCopia: Date.now() - VENTANA_COPIA_AUTOMATICA_MS * 5 }), false);
});

test('tocaCopiarAutomatica: true si está activada y nunca se hizo ninguna copia', () => {
  assert.equal(tocaCopiarAutomatica({ habilitada: true, ultimaCopia: null }), true);
  assert.equal(tocaCopiarAutomatica({ habilitada: true, ultimaCopia: undefined }), true);
});

test('tocaCopiarAutomatica: false si pasaron menos de 24 h desde la última copia', () => {
  const ahora = Date.now();
  const haceUnaHora = ahora - 60 * 60 * 1000;
  assert.equal(tocaCopiarAutomatica({ habilitada: true, ultimaCopia: haceUnaHora, ahora }), false);
});

test('tocaCopiarAutomatica: true justo a las 24 h, y con más de 24 h', () => {
  const ahora = Date.now();
  assert.equal(tocaCopiarAutomatica({ habilitada: true, ultimaCopia: ahora - VENTANA_COPIA_AUTOMATICA_MS, ahora }), true);
  assert.equal(tocaCopiarAutomatica({ habilitada: true, ultimaCopia: ahora - VENTANA_COPIA_AUTOMATICA_MS * 3, ahora }), true);
});

test('tocaCopiarAutomatica: no es "a medianoche" — a las 23:59 desde la última copia sigue en false', () => {
  const ahora = Date.now();
  const casiUnDia = ahora - (VENTANA_COPIA_AUTOMATICA_MS - 60_000);
  assert.equal(tocaCopiarAutomatica({ habilitada: true, ultimaCopia: casiUnDia, ahora }), false);
});

// --- nombreArchivoRespaldo ---

test('nombreArchivoRespaldo: mismo formato que el export manual (estados-rapidos-AAAA-MM-DD.json)', () => {
  const fecha = new Date('2026-09-29T15:30:00Z');
  assert.equal(nombreArchivoRespaldo(fecha), 'estados-rapidos-2026-09-29.json');
});

test('nombreArchivoRespaldo: sin argumento, usa la fecha actual', () => {
  const hoy = new Date().toISOString().slice(0, 10);
  assert.equal(nombreArchivoRespaldo(), `estados-rapidos-${hoy}.json`);
});

// --- nombresARotar ---

test('nombresARotar: con 7 o menos, no borra nada', () => {
  const nombres = Array.from({ length: 7 }, (_, i) => `estados-rapidos-2026-09-${String(i + 1).padStart(2, '0')}.json`);
  assert.deepEqual(nombresARotar(nombres), []);
});

test('nombresARotar: con más de 7, borra las más viejas y conserva las 7 más nuevas', () => {
  const nombres = Array.from({ length: 10 }, (_, i) => `estados-rapidos-2026-09-${String(i + 1).padStart(2, '0')}.json`);
  const aBorrar = nombresARotar(nombres);
  assert.equal(aBorrar.length, 3);
  // Las 3 más viejas (01, 02, 03) son las que se van; las últimas 7 (04..10) se quedan.
  assert.deepEqual(
    aBorrar.sort(),
    ['estados-rapidos-2026-09-01.json', 'estados-rapidos-2026-09-02.json', 'estados-rapidos-2026-09-03.json'].sort()
  );
});

test('nombresARotar: ignora nombres que no son de esta app (no matchean el patrón)', () => {
  const nombres = [
    ...Array.from({ length: 8 }, (_, i) => `estados-rapidos-2026-09-${String(i + 1).padStart(2, '0')}.json`),
    'foto-de-perfil.json',
    'otra-app-2026-09-01.json',
  ];
  const aBorrar = nombresARotar(nombres);
  assert.equal(aBorrar.length, 1); // de los 8 propios, se borra 1 (quedan 7)
  assert.ok(aBorrar[0].startsWith('estados-rapidos-'));
});

test('nombresARotar: respeta un `maximo` distinto de 7', () => {
  const nombres = Array.from({ length: 5 }, (_, i) => `estados-rapidos-2026-09-${String(i + 1).padStart(2, '0')}.json`);
  assert.equal(nombresARotar(nombres, 3).length, 2);
});

test('nombresARotar: nombres duplicados cuentan una sola vez', () => {
  const nombres = ['estados-rapidos-2026-09-01.json', 'estados-rapidos-2026-09-01.json'];
  assert.deepEqual(nombresARotar(nombres, 1), []);
});

test('nombresARotar: entrada no-array no rompe, devuelve []', () => {
  assert.deepEqual(nombresARotar(null), []);
  assert.deepEqual(nombresARotar(undefined), []);
});
