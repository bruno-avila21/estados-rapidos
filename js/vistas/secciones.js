// Pantalla "Secciones": gestión de las etiquetas que agrupan/filtran Productos (días para publicar,
// rubros, lo que sea — CREAR-BRIEF.md, ronda "secciones"). Crear, renombrar, reordenar (subir/bajar,
// sin drag obligatorio) y borrar (nunca borra productos, solo los desasigna, con su propia
// confirmación).
import * as repo from '../repositorio.js';
import { validarNombreSeccion } from '../modelo.js';
import { pedirConfirmacion } from '../utils/confirmar.js';
import { mostrarToast } from '../utils/toast.js';

export async function render(contenedor, { navegar }) {
  contenedor.textContent = '';
  const secciones = await repo.listarSecciones();
  const recargar = () => render(contenedor, { navegar });

  const raiz = document.createElement('div');
  raiz.className = 'pila';

  const btnVolver = document.createElement('button');
  btnVolver.type = 'button';
  btnVolver.className = 'boton boton--fantasma';
  btnVolver.setAttribute('data-accion', 'volver');
  btnVolver.textContent = '← Volver a Productos';
  btnVolver.addEventListener('click', () => navegar('#/'));
  raiz.append(btnVolver);

  const grupoLista = document.createElement('div');
  grupoLista.className = 'grupo';
  const tituloLista = document.createElement('div');
  tituloLista.className = 'grupo__titulo';
  tituloLista.textContent = 'Tus secciones';
  grupoLista.append(tituloLista);

  const lista = document.createElement('div');
  lista.className = 'lista-secciones';
  if (secciones.length === 0) {
    const vacio = document.createElement('p');
    vacio.className = 'texto-tenue';
    vacio.textContent =
      'Todavía no creaste ninguna. Usalas para agrupar productos por día para publicar ("Lunes", "Martes") o por rubro ("Lencería", "Electrodomésticos") — un producto puede estar en varias a la vez.';
    lista.append(vacio);
  } else {
    secciones.forEach((seccion, indice) => {
      lista.append(filaSeccion(seccion, indice, secciones.length, recargar));
    });
  }
  grupoLista.append(lista);
  raiz.append(grupoLista);

  const grupoNueva = document.createElement('div');
  grupoNueva.className = 'grupo';
  const tituloNueva = document.createElement('div');
  tituloNueva.className = 'grupo__titulo';
  tituloNueva.textContent = 'Nueva sección';
  const formNueva = document.createElement('form');
  formNueva.className = 'fila';
  const inputNueva = document.createElement('input');
  inputNueva.type = 'text';
  inputNueva.maxLength = 40;
  inputNueva.placeholder = 'Ej: Lunes, Lencería…';
  inputNueva.setAttribute('aria-label', 'Nombre de la nueva sección');
  const btnAgregar = document.createElement('button');
  btnAgregar.type = 'submit';
  btnAgregar.className = 'boton boton--primario';
  btnAgregar.setAttribute('data-accion', 'crear-seccion');
  btnAgregar.textContent = 'Agregar';
  formNueva.append(inputNueva, btnAgregar);
  formNueva.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const { ok, error } = validarNombreSeccion(inputNueva.value);
    if (!ok) {
      mostrarToast(error);
      return;
    }
    await repo.crearSeccion(inputNueva.value);
    mostrarToast('Sección creada');
    recargar();
  });
  grupoNueva.append(tituloNueva, formNueva);
  raiz.append(grupoNueva);

  contenedor.append(raiz);
}

function filaSeccion(seccion, indice, total, recargar) {
  const fila = document.createElement('div');
  fila.className = 'fila fila-seccion';
  fila.setAttribute('data-id', seccion.id);

  const nombre = document.createElement('input');
  nombre.type = 'text';
  nombre.className = 'fila-seccion__nombre';
  nombre.maxLength = 40;
  nombre.value = seccion.nombre;
  nombre.setAttribute('data-accion', 'renombrar');
  nombre.setAttribute('aria-label', `Nombre de la sección ${seccion.nombre}`);
  const guardarNombre = async () => {
    const { ok, error } = validarNombreSeccion(nombre.value);
    if (!ok) {
      mostrarToast(error);
      nombre.value = seccion.nombre;
      return;
    }
    if (nombre.value.trim() === seccion.nombre) return;
    await repo.renombrarSeccion(seccion.id, nombre.value);
    mostrarToast('Sección renombrada');
    recargar();
  };
  nombre.addEventListener('blur', guardarNombre);
  nombre.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') nombre.blur();
  });

  const btnSubir = document.createElement('button');
  btnSubir.type = 'button';
  btnSubir.className = 'boton-icono';
  btnSubir.setAttribute('data-accion', 'subir-seccion');
  btnSubir.setAttribute('aria-label', `Subir ${seccion.nombre}`);
  btnSubir.textContent = '↑';
  btnSubir.disabled = indice === 0;
  btnSubir.addEventListener('click', async () => {
    await repo.reordenarSeccion(seccion.id, 'subir');
    recargar();
  });

  const btnBajar = document.createElement('button');
  btnBajar.type = 'button';
  btnBajar.className = 'boton-icono';
  btnBajar.setAttribute('data-accion', 'bajar-seccion');
  btnBajar.setAttribute('aria-label', `Bajar ${seccion.nombre}`);
  btnBajar.textContent = '↓';
  btnBajar.disabled = indice === total - 1;
  btnBajar.addEventListener('click', async () => {
    await repo.reordenarSeccion(seccion.id, 'bajar');
    recargar();
  });

  const btnBorrar = document.createElement('button');
  btnBorrar.type = 'button';
  btnBorrar.className = 'boton boton--fantasma';
  btnBorrar.setAttribute('data-accion', 'borrar-seccion');
  btnBorrar.textContent = 'Borrar';
  btnBorrar.addEventListener('click', async () => {
    const ok = await pedirConfirmacion({
      titulo: 'Borrar sección',
      mensaje: `Se va a borrar "${seccion.nombre}". Los productos NO se borran: solo quedan desasignados de esta sección.`,
      textoConfirmar: 'Borrar',
    });
    if (!ok) return;
    await repo.borrarSeccion(seccion.id);
    mostrarToast('Sección borrada');
    recargar();
  });

  fila.append(nombre, btnSubir, btnBajar, btnBorrar);
  return fila;
}
