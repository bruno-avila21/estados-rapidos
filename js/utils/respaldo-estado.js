// Estado del último respaldo (manual o automático) y del aviso de la PWA — localStorage, no
// IndexedDB: main.js necesita leerlo en el arranque, apenas la app pasa a primer plano, sin
// esperar a que la base abra. Antes vivía privado dentro de js/vistas/respaldo.js; se extrae para
// que la copia automática (main.js + respaldo-copia.js) también pueda leer/escribir el mismo
// registro que ya alimenta la tarjeta "Estado actual" de la pantalla Respaldo.
const CLAVE_ULTIMO_RESPALDO = 'estados-rapidos:ultimo-respaldo';
const CLAVE_AVISO_DESCARTADO = 'estados-rapidos:aviso-respaldo-descartado';

/** `{ fecha, tamano, automatico? }` del último respaldo generado (manual, automático en el APK, o
 * disparado con el toque de "Descargar" del aviso de la PWA), o `null` si nunca se hizo ninguno. */
export function leerUltimoRespaldo() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ULTIMO_RESPALDO) || 'null');
  } catch {
    return null;
  }
}

export function guardarUltimoRespaldo(datos) {
  try {
    localStorage.setItem(CLAVE_ULTIMO_RESPALDO, JSON.stringify(datos));
  } catch {
    /* localStorage puede fallar en modo privado; no es crítico para el respaldo en sí */
  }
}

/** El aviso "Hace más de un día que no guardás una copia" (solo PWA) se descarta por el día: si
 * ya se cerró hoy, no vuelve a aparecer hasta que cambie la fecha (no un timer de horas). */
export function avisoRespaldoDescartadoHoy() {
  try {
    return localStorage.getItem(CLAVE_AVISO_DESCARTADO) === new Date().toISOString().slice(0, 10);
  } catch {
    return false;
  }
}

export function marcarAvisoRespaldoDescartado() {
  try {
    localStorage.setItem(CLAVE_AVISO_DESCARTADO, new Date().toISOString().slice(0, 10));
  } catch {
    /* idem: no crítico */
  }
}
