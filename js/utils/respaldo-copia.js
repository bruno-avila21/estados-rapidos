// Arma el MISMO JSON que el export manual (repo.exportarRespaldo) y lo guarda, con 3 variantes de
// "cómo llega a disco" según quién lo dispara — ronda "copia automática" (Respaldo → "Preferencias
// de respaldo"). Lo usan tanto el botón manual de respaldo.js como el disparador de 24h de main.js
// (silencioso en el APK, con el aviso de un toque en la PWA).
import * as repo from '../repositorio.js';
import { enApk, guardarArchivoApk, guardarCopiaAutomaticaApk } from './plataforma.js';
import { nombreArchivoRespaldo } from '../respaldo-automatico.js';
import { guardarUltimoRespaldo } from './respaldo-estado.js';

/**
 * @param {'manual'|'automatico'} modo
 *   - 'manual': el botón "Descargar respaldo (.json)" de Respaldo — SAF (picker) en el APK,
 *     `<a download>` en el navegador. Sin cambios de comportamiento respecto de antes.
 *   - 'automatico': el disparador de 24h (main.js) — en el APK va SOLA a Documents/EstadosRapidos/
 *     (sin picker, streaming); en el navegador es la misma descarga que 'manual' pero la dispara
 *     el toque de "Descargar" del aviso, no el botón de la pantalla Respaldo.
 * @returns {Promise<{fecha: number, tamano: number, automatico: boolean}>} el registro que queda
 *   guardado como "último respaldo" (mismo dato que lee la tarjeta "Estado actual").
 */
export async function generarYGuardarRespaldo(modo = 'manual') {
  const respaldo = await repo.exportarRespaldo();
  const contenido = JSON.stringify(respaldo);
  const nombreArchivo = nombreArchivoRespaldo();
  const automatico = modo === 'automatico';

  if (automatico && enApk()) {
    await guardarCopiaAutomaticaApk({ nombre: nombreArchivo, contenido });
  } else if (enApk()) {
    guardarArchivoApk({ nombre: nombreArchivo, mime: 'application/json', contenido });
  } else {
    descargarEnNavegador(nombreArchivo, contenido);
  }

  const registro = { fecha: Date.now(), tamano: new Blob([contenido]).size, automatico };
  guardarUltimoRespaldo(registro);
  return registro;
}

function descargarEnNavegador(nombreArchivo, contenido) {
  const blob = new Blob([contenido], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
