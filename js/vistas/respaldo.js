// Pantalla "Respaldo": exportar/importar un .json con productos, fotos (base64) y plantilla.
import * as repo from '../repositorio.js';
import { validarRespaldo } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';

export async function render(contenedor) {
  contenedor.textContent = '';

  const wrap = document.createElement('div');
  wrap.className = 'pila';

  const info = document.createElement('p');
  info.className = 'texto-tenue';
  info.textContent =
    'Los datos viven solo en este celular. Exportá un archivo antes de cambiar de equipo o borrar el navegador.';
  wrap.append(info);

  const grupoExportar = document.createElement('div');
  grupoExportar.className = 'grupo';
  const tituloExportar = document.createElement('div');
  tituloExportar.className = 'grupo__titulo';
  tituloExportar.textContent = 'Exportar';
  const btnExportar = document.createElement('button');
  btnExportar.type = 'button';
  btnExportar.className = 'boton boton--primario boton--ancho';
  btnExportar.setAttribute('data-accion', 'exportar');
  btnExportar.textContent = 'Descargar respaldo (.json)';
  btnExportar.addEventListener('click', async () => {
    btnExportar.disabled = true;
    try {
      const respaldo = await repo.exportarRespaldo();
      const blob = new Blob([JSON.stringify(respaldo)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `estados-rapidos-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      mostrarToast('Respaldo descargado');
    } catch (error) {
      mostrarToast('No se pudo exportar: ' + error.message);
    } finally {
      btnExportar.disabled = false;
    }
  });
  grupoExportar.append(tituloExportar, btnExportar);

  const grupoImportar = document.createElement('div');
  grupoImportar.className = 'grupo';
  const tituloImportar = document.createElement('div');
  tituloImportar.className = 'grupo__titulo';
  tituloImportar.textContent = 'Importar';
  const avisoImportar = document.createElement('p');
  avisoImportar.className = 'texto-tenue';
  avisoImportar.textContent = 'Reemplaza TODOS los productos y la plantilla actuales.';
  const inputArchivo = document.createElement('input');
  inputArchivo.type = 'file';
  inputArchivo.accept = 'application/json';
  inputArchivo.className = 'campo-oculto';
  inputArchivo.tabIndex = -1; // el disparo lo hace el botón visible (QA.md #7)
  inputArchivo.setAttribute('data-accion-input', 'importar');
  const btnImportar = document.createElement('button');
  btnImportar.type = 'button';
  btnImportar.className = 'boton boton--ancho';
  btnImportar.setAttribute('data-accion', 'importar');
  btnImportar.textContent = 'Elegir archivo…';
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

  grupoImportar.append(tituloImportar, avisoImportar, btnImportar, inputArchivo, errorImportar);

  // --- Zona de peligro: borrar todo (capa 3, detrás de un rótulo explícito) ---
  const grupoPeligro = document.createElement('div');
  grupoPeligro.className = 'grupo';
  const tituloPeligro = document.createElement('div');
  tituloPeligro.className = 'grupo__titulo';
  tituloPeligro.textContent = 'Zona de peligro';
  const avisoPeligro = document.createElement('p');
  avisoPeligro.className = 'texto-tenue';
  avisoPeligro.textContent = 'Borra productos, fotos y la plantilla de este celular. No se puede deshacer.';
  const btnBorrarTodo = document.createElement('button');
  btnBorrarTodo.type = 'button';
  btnBorrarTodo.className = 'boton boton--peligro boton--ancho';
  btnBorrarTodo.setAttribute('data-accion', 'borrar-todo');
  btnBorrarTodo.textContent = 'Borrar todos los datos';
  btnBorrarTodo.addEventListener('click', async () => {
    const confirmado = await pedirConfirmacion({
      titulo: 'Borrar todos los datos',
      mensaje:
        'Esto borra TODOS los productos, sus fotos y la plantilla de este celular. Si no exportaste un respaldo antes, se pierde todo para siempre. ¿Seguro que querés continuar?',
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
  grupoPeligro.append(tituloPeligro, avisoPeligro, btnBorrarTodo);

  wrap.append(grupoExportar, grupoImportar, grupoPeligro);
  contenedor.append(wrap);
}
