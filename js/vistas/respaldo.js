// Pantalla "Respaldo": exportar/importar un .json con productos, fotos (base64) y plantilla.
// Reskin "Organic Minimalist" (Interfaz/stitch_.../respaldo_natural): 3 tarjetas ("Estado del
// respaldo", "Restaurar catálogo", "Zona de peligro"). El mock original promete backup automático
// en Google Drive, historial de copias anteriores y export a CSV/Excel — nada de eso existe (la app
// no tiene backend ni nube): se muestran datos REALES (cuántos productos/secciones hay ahora, cuándo
// se generó el último .json, con qué tamaño) en vez de esas promesas. Detalle de lo que se dejó
// afuera en el commit de esta ronda.
import * as repo from '../repositorio.js';
import { validarRespaldo } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';
import { enApk, guardarArchivoApk } from '../utils/plataforma.js';
import { crearIcono } from '../utils/iconos.js';

const CLAVE_ULTIMO_RESPALDO = 'estados-rapidos:ultimo-respaldo';

function leerUltimoRespaldo() {
  try {
    return JSON.parse(localStorage.getItem(CLAVE_ULTIMO_RESPALDO) || 'null');
  } catch {
    return null;
  }
}

function guardarUltimoRespaldo(datos) {
  try {
    localStorage.setItem(CLAVE_ULTIMO_RESPALDO, JSON.stringify(datos));
  } catch {
    /* localStorage puede fallar en modo privado; no es crítico para el export en sí */
  }
}

function formatearFecha(timestamp) {
  return new Date(timestamp).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatearTamano(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function render(contenedor) {
  contenedor.textContent = '';

  const [productos, secciones] = await Promise.all([repo.listarProductos(), repo.listarSecciones()]);
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
  subtituloPagina.textContent = 'Copia de seguridad de tu catálogo';
  const textosPagina = document.createElement('div');
  textosPagina.append(h1Pagina, subtituloPagina);
  const iconoEscudo = document.createElement('span');
  iconoEscudo.className = 'pagina__cabecera-icono';
  iconoEscudo.setAttribute('aria-hidden', 'true');
  iconoEscudo.append(crearIcono('escudo'));
  cabeceraPagina.append(textosPagina, iconoEscudo);
  wrap.append(cabeceraPagina);

  const info = document.createElement('p');
  info.className = 'texto-tenue';
  info.textContent =
    'Los datos viven solo en este celular. Exportá un archivo antes de cambiar de equipo o borrar el navegador.';
  wrap.append(info);

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

  const datos = document.createElement('dl');
  datos.className = 'panel-respaldo__datos';
  datos.append(
    filaDato('Último respaldo', ultimoRespaldo ? formatearFecha(ultimoRespaldo.fecha) : 'Nunca'),
    filaDato('Tamaño del archivo', ultimoRespaldo ? formatearTamano(ultimoRespaldo.tamano) : '—'),
    filaDato('Contenido', `${productos.length} producto${productos.length === 1 ? '' : 's'} · ${secciones.length} sección${secciones.length === 1 ? '' : 'es'}`),
    // El mock dice "Destino en la nube: Google Drive" — no hay nube: el único destino real es el
    // archivo que el navegador/SAF guarda en el celular.
    filaDato('Destino', 'Archivo .json en este celular')
  );

  const btnExportar = document.createElement('button');
  btnExportar.type = 'button';
  btnExportar.className = 'boton boton--primario boton--ancho';
  btnExportar.setAttribute('data-accion', 'exportar');
  btnExportar.append(crearIcono('subir'), document.createTextNode('Descargar respaldo (.json)'));
  btnExportar.addEventListener('click', async () => {
    btnExportar.disabled = true;
    try {
      const respaldo = await repo.exportarRespaldo();
      const contenido = JSON.stringify(respaldo);
      const nombreArchivo = `estados-rapidos-${new Date().toISOString().slice(0, 10)}.json`;
      guardarUltimoRespaldo({ fecha: Date.now(), tamano: new Blob([contenido]).size });
      if (enApk()) {
        // <a download> con un blob: no descarga nada confiable dentro de un WebView: el
        // usuario elige dónde guardarlo con el selector del sistema (SAF).
        guardarArchivoApk({ nombre: nombreArchivo, mime: 'application/json', contenido });
      } else {
        const blob = new Blob([contenido], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = nombreArchivo;
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        mostrarToast('Respaldo descargado');
      }
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

  // --- Panel 3: zona de peligro (sin equivalente en el mock, que no la modela — se mantiene
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
