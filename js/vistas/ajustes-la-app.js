// Sección "La app" de Ajustes: instalarla, compartirla (link + QR) para que la usen compañeros de
// trabajo (CREAR-BRIEF.md). Separada de ajustes.js por tamaño; se llama como `seccionLaApp()` y
// devuelve el <div> ya armado, listo para `append`.
import { estaInstalada, hayPromptDeInstalacion, solicitarInstalacion, linkDeLaApp } from '../utils/instalacion.js';
import { dibujarQREnCanvas } from '../utils/qr.js';
import { mostrarToast } from '../utils/toast.js';
import { enApk, versionApk } from '../utils/plataforma.js';

export function seccionLaApp() {
  const div = document.createElement('div');
  div.className = 'grupo';
  const titulo = document.createElement('div');
  titulo.className = 'grupo__titulo';
  titulo.textContent = 'La app';

  // El APK es autónomo (sin hosting): no hay link ni QR que compartir, ni un navegador desde
  // el que "instalarla" — ya está instalada. Bruno la reparte pasando el .apk por WhatsApp.
  if (enApk()) {
    const explicacion = document.createElement('p');
    explicacion.className = 'grupo__explicacion';
    explicacion.textContent = 'Esta es la versión empaquetada para Android.';
    const version = document.createElement('p');
    version.className = 'texto-tenue';
    version.setAttribute('data-estado', 'version-apk');
    version.textContent = `Versión ${versionApk() || '1.0'} (APK)`;
    div.append(titulo, explicacion, version);
    return div;
  }

  const explicacion = document.createElement('p');
  explicacion.className = 'grupo__explicacion';
  explicacion.textContent = 'Para instalarla en otro celular o compartirla con un compañero de trabajo.';
  div.append(titulo, explicacion);

  // --- Instalar ---
  const bloqueInstalar = document.createElement('div');
  bloqueInstalar.className = 'pila';

  if (estaInstalada()) {
    const yaInstalada = document.createElement('p');
    yaInstalada.className = 'texto-tenue';
    yaInstalada.setAttribute('data-estado', 'ya-instalada');
    yaInstalada.textContent = 'Ya está instalada en este dispositivo.';
    bloqueInstalar.append(yaInstalada);
  } else if (hayPromptDeInstalacion()) {
    const btnInstalar = document.createElement('button');
    btnInstalar.type = 'button';
    btnInstalar.className = 'boton boton--primario boton--ancho';
    btnInstalar.setAttribute('data-accion', 'instalar-app');
    btnInstalar.textContent = 'Instalar la app';
    btnInstalar.addEventListener('click', async () => {
      btnInstalar.disabled = true;
      const resultado = await solicitarInstalacion();
      if (resultado === 'accepted') {
        mostrarToast('¡Instalando!');
        btnInstalar.textContent = 'Ya está instalada en este dispositivo.';
        btnInstalar.disabled = true;
      } else if (resultado === 'dismissed') {
        mostrarToast('Cancelaste la instalación');
        btnInstalar.disabled = false;
      } else {
        // el prompt ya se consumió (solo se puede usar una vez): quedan las instrucciones cortas.
        mostrarToast('Instalala desde el menú del navegador');
        btnInstalar.replaceWith(instruccionesInstalar());
      }
    });
    bloqueInstalar.append(btnInstalar);
  } else {
    bloqueInstalar.append(instruccionesInstalar());
  }
  div.append(bloqueInstalar);

  // --- Compartir + QR ---
  const bloqueCompartir = document.createElement('div');
  bloqueCompartir.className = 'pila';

  const btnCompartir = document.createElement('button');
  btnCompartir.type = 'button';
  btnCompartir.className = 'boton boton--ancho';
  btnCompartir.setAttribute('data-accion', 'compartir-app');
  btnCompartir.textContent = 'Compartir la app';
  btnCompartir.addEventListener('click', () => compartirApp());
  bloqueCompartir.append(btnCompartir);

  const contenedorQR = document.createElement('div');
  contenedorQR.className = 'qr-app';
  const canvasQR = document.createElement('canvas');
  canvasQR.className = 'qr-app__canvas';
  canvasQR.setAttribute('role', 'img');
  const link = linkDeLaApp();
  canvasQR.setAttribute('aria-label', `Código QR con el link de la app: ${link}`);
  contenedorQR.append(canvasQR);
  const textoLink = document.createElement('p');
  textoLink.className = 'texto-tenue qr-app__link';
  textoLink.textContent = link;
  bloqueCompartir.append(contenedorQR, textoLink);

  div.append(bloqueCompartir);

  // El canvas necesita estar en el DOM (con su tamaño CSS final) para calcular la resolución real;
  // se dibuja en el siguiente frame, ya montado.
  requestAnimationFrame(() => {
    try {
      dibujarQREnCanvas(canvasQR, link, { margen: 3 });
    } catch (error) {
      contenedorQR.textContent = '';
      const aviso = document.createElement('p');
      aviso.setAttribute('role', 'alert');
      aviso.textContent = 'No se pudo generar el QR: ' + error.message;
      contenedorQR.append(aviso);
    }
  });

  return div;
}

function instruccionesInstalar() {
  const p = document.createElement('p');
  p.className = 'texto-tenue';
  p.setAttribute('data-estado', 'instrucciones-instalar');
  p.textContent = 'Para instalarla: en Chrome, tocá ⋮ (arriba a la derecha) → "Instalar app" (o "Agregar a pantalla de inicio").';
  return p;
}

async function compartirApp() {
  const url = linkDeLaApp();
  const datos = { title: 'Estados rápidos', text: 'Armá estados de WhatsApp de tus productos en 3 segundos.', url };
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share(datos);
      return;
    } catch (error) {
      if (error?.name === 'AbortError') return; // canceló la hoja de compartir, no es un error
      // sigue al fallback de copiar si el share nativo falla por otro motivo
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    mostrarToast('Link copiado');
  } catch {
    mostrarToast('No se pudo copiar el link');
  }
}
