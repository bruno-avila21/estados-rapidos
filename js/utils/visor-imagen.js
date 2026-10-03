// Visor a pantalla completa: muestra UNA imagen entera (sin recortar) sobre un fondo oscuro, con
// "Cerrar". Lo usan las miniaturas de estilo (Ajustes/Plantilla) y la foto del alta/edición de
// producto, que en su lugar se ven chicas o recortadas. Mismo patrón que confirmar.js: overlay
// propio agregado al <body>, cierra con Escape, con el botón o tocando fuera de la imagen.
import { crearIcono } from './iconos.js';

/**
 * @param {{ titulo: string, obtenerBlob: () => Promise<Blob|null> }} opciones `obtenerBlob` se llama
 *   recién al abrir (la imagen 1080×1920 se arma a pedido, no por cada miniatura de la pantalla).
 * @returns {Promise<void>} se resuelve al cerrar.
 */
export function abrirVisorImagen({ titulo, obtenerBlob }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'visor-imagen';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', titulo);

    const cabecera = document.createElement('div');
    cabecera.className = 'visor-imagen__cabecera';
    const tituloEl = document.createElement('span');
    tituloEl.className = 'visor-imagen__titulo';
    tituloEl.textContent = titulo;
    const btnCerrar = document.createElement('button');
    btnCerrar.type = 'button';
    btnCerrar.className = 'visor-imagen__cerrar';
    btnCerrar.setAttribute('data-accion', 'cerrar-visor');
    btnCerrar.setAttribute('aria-label', 'Cerrar');
    btnCerrar.append(crearIcono('equis'));
    cabecera.append(tituloEl, btnCerrar);

    const cuerpo = document.createElement('div');
    cuerpo.className = 'visor-imagen__cuerpo';
    const estado = document.createElement('p');
    estado.className = 'visor-imagen__estado';
    estado.setAttribute('role', 'status');
    estado.textContent = 'Armando la imagen…';
    cuerpo.append(estado);

    let url = null;
    let cerrado = false;
    const cerrar = () => {
      if (cerrado) return;
      cerrado = true;
      document.removeEventListener('keydown', alEscape);
      if (url) URL.revokeObjectURL(url);
      overlay.remove();
      resolve();
    };
    const alEscape = (ev) => {
      if (ev.key === 'Escape') cerrar();
    };

    btnCerrar.addEventListener('click', cerrar);
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay || ev.target === cuerpo) cerrar();
    });
    document.addEventListener('keydown', alEscape);

    overlay.append(cabecera, cuerpo);
    document.body.append(overlay);
    btnCerrar.focus();

    Promise.resolve()
      .then(obtenerBlob)
      .then((blob) => {
        if (cerrado) return;
        if (!blob) throw new Error('sin imagen');
        url = URL.createObjectURL(blob);
        const img = document.createElement('img');
        img.className = 'visor-imagen__imagen';
        img.alt = titulo;
        img.src = url;
        cuerpo.replaceChildren(img);
      })
      .catch(() => {
        if (cerrado) return;
        estado.setAttribute('role', 'alert');
        estado.textContent = 'No se pudo armar la imagen. Cerrá y probá de nuevo.';
      });
  });
}
