// Pantalla "Respaldo": exportar/importar un .json con productos, fotos (base64) y plantilla.
// Reskin "Organic Minimalist" (Interfaz/stitch_.../respaldo_natural): 4 tarjetas ("Estado del
// respaldo", "Restaurar catálogo", "Preferencias de respaldo", "Zona de peligro"). El mock original
// promete backup automático en Google Drive, historial de copias anteriores y export a CSV/Excel —
// nada de eso existe (la app no tiene backend ni nube): se muestran datos REALES (cuántos
// productos/secciones hay ahora, cuándo se generó el último .json, con qué tamaño) en vez de esas
// promesas. Detalle de lo que se dejó afuera en el commit de esta ronda.
//
// "Preferencias de respaldo" (ronda "copia automática", 2026-09-29): el mock dibuja 3
// interruptores ("Copia automática diaria", "Incluir fotos en alta resolución", "Solo con conexión
// Wi-Fi"). Solo el primero es real acá: las fotos se guardan YA achicadas al elegirlas (no hay
// "alta resolución" que preservar) y la app no usa red en absoluto (ni tiene el permiso INTERNET),
// así que "Wi-Fi" no significa nada — dibujarlos apagados/deshabilitados sería prometer una función
// que no hace nada, mismo criterio que ya dejó afuera Google Drive/CSV en la ronda anterior.
import * as repo from '../repositorio.js';
import { validarRespaldo } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { enApk, guardarArchivoApk } from '../utils/plataforma.js';
import { crearIcono } from '../utils/iconos.js';
import { leerUltimoRespaldo } from '../utils/respaldo-estado.js';
import { generarYGuardarRespaldo } from '../utils/respaldo-copia.js';

// Formato relativo, como el mock ("Hoy, 10:42 AM"): "Hoy"/"Ayer" + hora si es reciente, la fecha
// completa si no (evita un "Hoy" engañoso para un respaldo de hace semanas).
function formatearFecha(timestamp) {
  const fecha = new Date(timestamp);
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  const mismoDia = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const ahora = new Date();
  if (mismoDia(fecha, ahora)) return `Hoy, ${hora}`;
  const ayer = new Date(ahora);
  ayer.setDate(ahora.getDate() - 1);
  if (mismoDia(fecha, ayer)) return `Ayer, ${hora}`;
  return `${fecha.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}, ${hora}`;
}

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function render(contenedor, { navegar } = {}) {
  contenedor.textContent = '';

  const recargar = () => render(contenedor, { navegar });
  const [productos, secciones, general] = await Promise.all([
    repo.listarProductos(),
    repo.listarSecciones(),
    repo.obtenerAjustesGenerales(),
  ]);
  const ultimoRespaldo = leerUltimoRespaldo();

  const wrap = document.createElement('div');
  wrap.className = 'pila';

  // --- H1 real de la pantalla (vive en el contenido: patrones.md regla 3 — el header compartido
  // ya no es <h1>, ahora muestra la marca "Estados Rápidos"). El ícono de escudo de la derecha es
  // el mismo elemento decorativo del mock (estado del respaldo local, no un candado de nube). ---
  const cabeceraPagina = document.createElement('div');
  cabeceraPagina.className = 'pagina__cabecera';
  const h1Pagina = document.createElement('h1');
  h1Pagina.className = 'pagina__titulo';
  h1Pagina.textContent = 'Respaldo';
  const subtituloPagina = document.createElement('p');
  subtituloPagina.className = 'pagina__subtitulo';
  // El mock no tiene un párrafo aparte para esto (solo el subtítulo chico) — se integra acá en vez
  // de repetirlo como texto suelto debajo.
  subtituloPagina.textContent = 'Copia de seguridad de tu catálogo: vive solo en este celular.';
  const textosPagina = document.createElement('div');
  textosPagina.append(h1Pagina, subtituloPagina);
  const iconoEscudo = document.createElement('span');
  iconoEscudo.className = 'pagina__cabecera-icono';
  iconoEscudo.setAttribute('aria-hidden', 'true');
  iconoEscudo.append(crearIcono('escudo'));
  cabeceraPagina.append(textosPagina, iconoEscudo);
  wrap.append(cabeceraPagina);

  // --- Panel 1: estado del respaldo (datos reales: nada de nube ni sincronización automática) ---
  const panelEstado = document.createElement('section');
  panelEstado.className = 'panel';
  const cabeceraEstado = document.createElement('div');
  cabeceraEstado.className = 'panel-respaldo__estado';
  const tituloEstado = document.createElement('h2');
  tituloEstado.className = 'panel__titulo-chico';
  tituloEstado.textContent = 'Estado actual';
  const pastilla = document.createElement('span');
  pastilla.className = 'panel-respaldo__pastilla';
  pastilla.append(crearIcono(ultimoRespaldo ? 'check' : 'info'), document.createTextNode(ultimoRespaldo ? 'Copia actualizada' : 'Sin copia todavía'));
  cabeceraEstado.append(tituloEstado, pastilla);

  // "Última copia (manual o automática)": el mismo registro sirve para las 3 formas de generarla
  // (botón, disparador de 24h en el APK, toque de "Descargar" del aviso en la PWA) — el sufijo
  // "(automática)" es la única diferencia visual entre ellas.
  const valorUltimoRespaldo = ultimoRespaldo
    ? `${formatearFecha(ultimoRespaldo.fecha)}${ultimoRespaldo.automatico ? ' (automática)' : ''}`
    : 'Nunca';

  const datos = document.createElement('dl');
  datos.className = 'panel-respaldo__datos';
  datos.append(
    filaDato('Último respaldo', valorUltimoRespaldo),
    filaDato('Tamaño del archivo', ultimoRespaldo ? formatearTamano(ultimoRespaldo.tamano) : '—'),
    filaDato('Contenido', `${productos.length} producto${productos.length === 1 ? '' : 's'} · ${secciones.length} sección${secciones.length === 1 ? '' : 'es'}`),
    // El mock dice "Destino en la nube: Google Drive" — no hay nube. El destino real cambia según
    // la plataforma: en el APK, el manual lo elige la persona (SAF) y la copia automática siempre
    // va a la misma carpeta pública; en el navegador, ambas caen en la carpeta de Descargas.
    filaDato(
      'Destino',
      enApk()
        ? 'Elegís la carpeta al exportar · la copia automática va a Documentos/EstadosRapidos'
        : 'Descarga de tu navegador (carpeta de Descargas)'
    )
  );

  const btnExportar = document.createElement('button');
  btnExportar.type = 'button';
  btnExportar.className = 'boton boton--primario boton--ancho';
  btnExportar.setAttribute('data-accion', 'exportar');
  btnExportar.append(crearIcono('subir'), document.createTextNode('Descargar respaldo (.json)'));
  btnExportar.addEventListener('click', async () => {
    btnExportar.disabled = true;
    try {
      await generarYGuardarRespaldo('manual');
      if (!enApk()) mostrarToast('Respaldo descargado');
      recargar();
    } catch (error) {
      mostrarToast('No se pudo exportar: ' + error.message);
    } finally {
      btnExportar.disabled = false;
    }
  });

  panelEstado.append(cabeceraEstado, datos, btnExportar);
  wrap.append(panelEstado);

  // --- Panel 2: restaurar catálogo (Importar) ---
  const panelImportar = document.createElement('section');
  panelImportar.className = 'panel';
  const rotuloImportar = document.createElement('span');
  rotuloImportar.className = 'panel__rotulo';
  rotuloImportar.append(crearIcono('carpeta'), document.createTextNode('Restaurar catálogo'));
  const avisoImportar = document.createElement('p');
  avisoImportar.className = 'panel__subtitulo';
  avisoImportar.textContent = 'Recuperá tus productos, fotos y secciones desde un archivo .json guardado antes. Reemplaza TODOS los actuales.';
  const inputArchivo = document.createElement('input');
  inputArchivo.type = 'file';
  inputArchivo.accept = 'application/json';
  inputArchivo.className = 'campo-oculto';
  inputArchivo.tabIndex = -1; // el disparo lo hace el botón visible (QA.md #7)
  inputArchivo.setAttribute('data-accion-input', 'importar');
  const btnImportar = document.createElement('button');
  btnImportar.type = 'button';
  btnImportar.className = 'boton boton--contorno boton--ancho panel-respaldo__boton-secundario';
  btnImportar.setAttribute('data-accion', 'importar');
  btnImportar.append(crearIcono('carpeta'), document.createTextNode('Elegir archivo…'));
  btnImportar.addEventListener('click', () => inputArchivo.click());

  const errorImportar = document.createElement('div');
  errorImportar.setAttribute('role', 'alert');
  errorImportar.hidden = true;

  inputArchivo.addEventListener('change', async (ev) => {
    errorImportar.hidden = true;
    const archivo = ev.target.files?.[0];
    if (!archivo) return;
    if (archivo.size > 60_000_000) {
      errorImportar.hidden = false;
      errorImportar.textContent = 'El archivo es demasiado grande (máx. 60 MB).';
      return;
    }
    let objeto;
    try {
      objeto = JSON.parse(await archivo.text());
    } catch {
      errorImportar.hidden = false;
      errorImportar.textContent = 'El archivo no es un JSON válido.';
      return;
    }
    const { ok, error } = validarRespaldo(objeto);
    if (!ok) {
      errorImportar.hidden = false;
      errorImportar.textContent = error;
      return;
    }
    const confirmado = await pedirConfirmacion({
      titulo: 'Importar respaldo',
      mensaje: `Se van a reemplazar los productos actuales por los ${objeto.productos.length} del archivo. Esta acción no se puede deshacer.`,
      textoConfirmar: 'Importar',
    });
    if (!confirmado) {
      inputArchivo.value = '';
      return;
    }
    try {
      await repo.importarRespaldo(objeto);
      mostrarToast('Respaldo importado');
      location.hash = '#/';
    } catch (e) {
      errorImportar.hidden = false;
      errorImportar.textContent = 'No se pudo importar: ' + e.message;
    } finally {
      inputArchivo.value = '';
    }
  });

  panelImportar.append(rotuloImportar, avisoImportar, btnImportar, inputArchivo, errorImportar);
  wrap.append(panelImportar);

  // --- Panel 3 (mock: "Preferencias de respaldo"): copia automática diaria ---
  const panelPreferencias = document.createElement('section');
  panelPreferencias.className = 'panel';
  const tituloPreferencias = document.createElement('h2');
  tituloPreferencias.className = 'panel__titulo-chico';
  tituloPreferencias.textContent = 'Preferencias de respaldo';
  panelPreferencias.append(tituloPreferencias);

  const filaAuto = document.createElement('label');
  filaAuto.className = 'panel-respaldo__preferencia';
  const infoAuto = document.createElement('div');
  infoAuto.className = 'panel-respaldo__preferencia-info';
  const iconoAuto = document.createElement('span');
  iconoAuto.className = 'panel-respaldo__preferencia-icono';
  iconoAuto.append(crearIcono('actualizar'));
  const textosAuto = document.createElement('div');
  const tituloAuto = document.createElement('span');
  tituloAuto.className = 'panel-respaldo__preferencia-titulo';
  tituloAuto.textContent = 'Copia automática diaria';
  const subtituloAuto = document.createElement('span');
  subtituloAuto.className = 'panel-respaldo__preferencia-subtitulo';
  // Texto real (no el "Sincronización a medianoche" del mock: no hay ningún proceso a medianoche,
  // el disparador es la app abriéndose/volviendo a primer plano).
  subtituloAuto.textContent = 'Al abrir la app, una vez por día.';
  textosAuto.append(tituloAuto, subtituloAuto);
  infoAuto.append(iconoAuto, textosAuto);

  const interruptorAuto = document.createElement('span');
  interruptorAuto.className = 'interruptor';
  const checkAuto = document.createElement('input');
  checkAuto.type = 'checkbox';
  checkAuto.id = 'respaldo-copia-automatica';
  checkAuto.setAttribute('data-accion', 'copia-automatica');
  checkAuto.checked = !!general.copiaAutomaticaHabilitada;
  const pistaAuto = document.createElement('span');
  pistaAuto.className = 'interruptor__pista';
  interruptorAuto.append(checkAuto, pistaAuto);
  checkAuto.addEventListener('change', async () => {
    await repo.guardarCopiaAutomaticaHabilitada(checkAuto.checked);
    mostrarToast(checkAuto.checked ? 'Copia automática activada' : 'Copia automática desactivada');
  });

  filaAuto.append(infoAuto, interruptorAuto);
  panelPreferencias.append(filaAuto);
  wrap.append(panelPreferencias);

  // --- Panel 4: zona de peligro (sin equivalente en el mock, que no la modela — se mantiene
  // porque borra datos reales del celular y tiene que seguir accesible). ---
  const panelPeligro = document.createElement('section');
  panelPeligro.className = 'panel';
  const rotuloPeligro = document.createElement('span');
  rotuloPeligro.className = 'panel__rotulo';
  rotuloPeligro.append(crearIcono('borrar'), document.createTextNode('Zona de peligro'));
  const avisoPeligro = document.createElement('p');
  avisoPeligro.className = 'panel__subtitulo';
  avisoPeligro.textContent = 'Borra productos, fotos, secciones y la plantilla de este celular. No se puede deshacer.';
  const btnBorrarTodo = document.createElement('button');
  btnBorrarTodo.type = 'button';
  btnBorrarTodo.className = 'boton boton--peligro-contorno boton--ancho';
  btnBorrarTodo.setAttribute('data-accion', 'borrar-todo');
  btnBorrarTodo.append(crearIcono('borrar'), document.createTextNode('Borrar todos los datos'));
  btnBorrarTodo.addEventListener('click', async () => {
    const confirmado = await pedirConfirmacion({
      titulo: 'Borrar todos los datos',
      mensaje:
        'Esto borra TODOS los productos, sus fotos, las secciones y la plantilla de este celular. Si no exportaste un respaldo antes, se pierde todo para siempre. ¿Seguro que querés continuar?',
      textoConfirmar: 'Borrar todo',
    });
    if (!confirmado) return;
    btnBorrarTodo.disabled = true;
    try {
      await repo.borrarTodo();
      mostrarToast('Todos los datos fueron borrados');
      location.hash = '#/'; // vuelve al estado vacío sin recargar la página
    } catch (error) {
      mostrarToast('No se pudo borrar: ' + error.message);
    } finally {
      btnBorrarTodo.disabled = false;
    }
  });
  panelPeligro.append(rotuloPeligro, avisoPeligro, btnBorrarTodo);
  wrap.append(panelPeligro);

  contenedor.append(wrap);
}

function filaDato(etiqueta, valor) {
  const fila = document.createElement('div');
  fila.className = 'panel-respaldo__fila-dato';
  const dt = document.createElement('dt');
  dt.textContent = etiqueta;
  const dd = document.createElement('dd');
  const fuerte = document.createElement('strong');
  fuerte.textContent = valor;
  dd.append(fuerte);
  fila.append(dt, dd);
  return fila;
}
