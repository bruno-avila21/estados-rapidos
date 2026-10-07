// Vista previa EN VIVO del estado: una miniatura 9:16 que se rearma sola mientras se escribe (con
// un respiro de 300 ms para no componer en cada tecla) y que, al tocarla, abre el estado entero en
// el visor. La usan Ajustes ("Texto que acompaña") y el alta/edición de producto.
import { abrirVisorImagen } from './visor-imagen.js';
import { componerVista } from './vista-completa.js';

/**
 * @param {{ obtenerOpciones: () => object, titulo?: string }} config `obtenerOpciones` devuelve las
 *   opciones de `componerVista` con lo que haya AHORA en pantalla (se llama en cada rearmado).
 * @returns {{ raiz: HTMLElement, actualizar: (o?: {inmediato?: boolean}) => void }}
 */
export function crearVistaPrevia({ obtenerOpciones, titulo = 'Así se ve el estado' }) {
  const raiz = document.createElement('div');
  raiz.className = 'vista-previa-estado';

  const marco = document.createElement('button');
  marco.type = 'button';
  marco.className = 'vista-previa-estado__marco';
  marco.setAttribute('data-accion', 'vista-previa');
  marco.setAttribute('aria-label', 'Vista previa del estado. Tocá para verla completa.');
  const placeholder = document.createElement('span');
  placeholder.className = 'vista-previa-estado__placeholder skeleton';
  placeholder.textContent = 'Armando…';
  marco.append(placeholder);

  const pista = document.createElement('span');
  pista.className = 'texto-tenue vista-previa-estado__pista';
  pista.textContent = 'Tocá la imagen para verla completa';
  raiz.append(marco, pista);

  let generacion = 0;
  let url = null;
  let temporizador = null;

  async function pintar() {
    const mia = ++generacion;
    try {
      const blob = await componerVista({ ...obtenerOpciones(), miniatura: true });
      if (mia !== generacion) return; // ya se pidió otra más nueva
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      let img = marco.querySelector('img');
      if (!img) {
        img = document.createElement('img');
        img.className = 'vista-previa-estado__imagen';
        img.alt = '';
        marco.replaceChildren(img);
      }
      img.src = url;
    } catch {
      if (mia === generacion && !marco.querySelector('img')) placeholder.textContent = 'Sin vista previa';
    }
  }

  function actualizar({ inmediato = false } = {}) {
    clearTimeout(temporizador);
    temporizador = setTimeout(pintar, inmediato ? 0 : 300);
  }

  marco.addEventListener('click', () =>
    abrirVisorImagen({ titulo, obtenerBlob: () => componerVista({ ...obtenerOpciones(), miniatura: false }) })
  );

  return { raiz, actualizar };
}
