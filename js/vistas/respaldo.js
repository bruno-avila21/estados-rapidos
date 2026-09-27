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

  wrap.append(grupoExportar, grupoImportar);
  contenedor.append(wrap);
}
