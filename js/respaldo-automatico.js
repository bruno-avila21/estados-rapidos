// Lógica pura de la copia automática diaria (Respaldo → "Preferencias de respaldo"): CUÁNDO toca
// copiar, cómo se nombra el archivo y qué archivos rotar para conservar como máximo 7. Nada de DOM
// ni de IndexedDB ni de puente nativo acá — se prueba con node:test (test/respaldo-automatico.test.js),
// mismo criterio que reordenar.js/editor-geometria.js/sw-estrategia.js (decisión separada del efecto).
//
// La usan: `js/utils/respaldo-copia.js` (dispara la copia, en la PWA y en el APK) y, del lado
// nativo, `PuenteArchivos.kt` (`rotarCopiasAutomaticas`) reimplementa el MISMO criterio de
// `nombresARotar` en Kotlin porque es quien realmente borra archivos de MediaStore — esta función
// es la especificación probada de esa regla, no un duplicado sin sentido.

export const VENTANA_COPIA_AUTOMATICA_MS = 24 * 60 * 60 * 1000; // 24 h — "una vez por día", no medianoche

/**
 * ¿Toca disparar la copia automática AHORA? Activada + (nunca se hizo una copia, o pasaron 24 h o
 * más desde la última). `ultimaCopia` es un timestamp (`Date.now()`) o `null`/`undefined`.
 */
export function tocaCopiarAutomatica({ habilitada, ultimaCopia, ahora = Date.now() }) {
  if (!habilitada) return false;
  if (ultimaCopia == null) return true;
  return ahora - ultimaCopia >= VENTANA_COPIA_AUTOMATICA_MS;
}

/** Mismo nombre que ya usa el export manual (respaldo.js): estados-rapidos-AAAA-MM-DD.json */
export function nombreArchivoRespaldo(fecha = new Date()) {
  return `estados-rapidos-${fecha.toISOString().slice(0, 10)}.json`;
}

const PATRON_NOMBRE_COPIA = /^estados-rapidos-(\d{4}-\d{2}-\d{2}).*\.json$/;

/**
 * De una lista de nombres de archivo YA existentes (los que creó esta app en su carpeta pública),
 * decide cuáles hay que BORRAR para conservar como máximo `maximo` (7 por defecto): se quedan los
 * más NUEVOS por la fecha codificada en el nombre. Nombres que no matchean el patrón (no son de
 * esta app, o alguien los renombró) se ignoran por completo — nunca se tocan. Duplicados exactos
 * cuentan una sola vez.
 */
export function nombresARotar(nombres, maximo = 7) {
  if (!Array.isArray(nombres)) return [];
  const propios = Array.from(new Set(nombres.filter((n) => typeof n === 'string' && PATRON_NOMBRE_COPIA.test(n))));
  // Orden descendente por nombre completo: como la fecha va primero y en formato AAAA-MM-DD, el
  // orden lexicográfico del nombre YA es el orden cronológico (mismo truco que usa Kotlin del lado
  // nativo, sortedByDescending sobre el DISPLAY_NAME).
  const ordenados = propios.sort((a, b) => b.localeCompare(a));
  return ordenados.slice(maximo);
}
