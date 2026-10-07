// Confirmación de dos pasos propia (NUNCA confirm() nativo). Devuelve una Promise<boolean>.
// Con `textoAlternativa` suma un tercer botón (primario, ej. "Guardar y salir"): elegirlo resuelve
// con el string 'alternativa' en vez de un booleano.
export function pedirConfirmacion({ titulo, mensaje, textoConfirmar = 'Borrar', textoCancelar = 'Cancelar', textoAlternativa = '' }) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'dialogo-overlay';
    overlay.setAttribute('role', 'presentation');

    const caja = document.createElement('div');
    caja.className = 'dialogo';
    caja.setAttribute('role', 'alertdialog');
    caja.setAttribute('aria-modal', 'true');

    const h = document.createElement('h2');
    h.className = 'dialogo__titulo';
    h.textContent = titulo;

    const p = document.createElement('p');
    p.className = 'dialogo__mensaje';
    p.textContent = mensaje;

    const acciones = document.createElement('div');
    acciones.className = 'dialogo__acciones';

    const btnCancelar = document.createElement('button');
    btnCancelar.type = 'button';
    btnCancelar.className = 'boton boton--fantasma';
    btnCancelar.textContent = textoCancelar;
    btnCancelar.setAttribute('data-accion', 'cancelar');

    const btnConfirmar = document.createElement('button');
    btnConfirmar.type = 'button';
    btnConfirmar.className = 'boton boton--peligro';
    btnConfirmar.textContent = textoConfirmar;
    btnConfirmar.setAttribute('data-accion', 'confirmar-borrar');

    const cerrar = (resultado) => {
      document.removeEventListener('keydown', alEscape);
      overlay.remove();
      resolve(resultado);
    };
    const alEscape = (ev) => {
      if (ev.key === 'Escape') cerrar(false);
    };

    btnCancelar.addEventListener('click', () => cerrar(false));
    btnConfirmar.addEventListener('click', () => cerrar(true));
    overlay.addEventListener('click', (ev) => {
      if (ev.target === overlay) cerrar(false);
    });
    document.addEventListener('keydown', alEscape);

    acciones.append(btnCancelar, btnConfirmar);
    let btnAlternativa = null;
    if (textoAlternativa) {
      btnAlternativa = document.createElement('button');
      btnAlternativa.type = 'button';
      btnAlternativa.className = 'boton boton--primario';
      btnAlternativa.textContent = textoAlternativa;
      btnAlternativa.setAttribute('data-accion', 'confirmar-alternativa');
      btnAlternativa.addEventListener('click', () => cerrar('alternativa'));
      acciones.classList.add('dialogo__acciones--tres');
      acciones.prepend(btnAlternativa);
    }
    caja.append(h, p, acciones);
    overlay.append(caja);
    document.body.append(overlay);
    (btnAlternativa || btnConfirmar).focus();
  });
}
