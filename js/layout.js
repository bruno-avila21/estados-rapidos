// Cálculo de layout de texto: puro, sin canvas. Recibe una función medirAncho(texto, tamano) => px
// para poder testearse con node:test (con una medida simulada) y usarse en el navegador con
// ctx.measureText real. Regla del brief: "achicar o partir en 2 líneas, nunca salirse de la caja".

/**
 * Calcula cuántas líneas y a qué tamaño de fuente entra `texto` dentro de un ancho máximo.
 * Estrategia: 1) probar en una línea, bajando el tamaño hasta el mínimo; 2) si no entra,
 * partir en hasta `maxLineas` líneas al tamaño mínimo; 3) si ni así entra, se devuelve igual
 * (el dibujo hace clip a la caja como red de seguridad, nunca se sale visualmente).
 */
export function calcularLineas({
  texto,
  anchoMax,
  medirAncho,
  tamanoInicial,
  tamanoMinimo = 16,
  paso = 2,
  maxLineas = 2,
}) {
  const limpio = (texto ?? '').trim();
  if (!limpio) return { lineas: [''], tamano: tamanoInicial };

  for (let tamano = tamanoInicial; tamano >= tamanoMinimo; tamano -= paso) {
    if (medirAncho(limpio, tamano) <= anchoMax) return { lineas: [limpio], tamano };
  }

  for (let tamano = tamanoInicial; tamano >= tamanoMinimo; tamano -= paso) {
    const lineas = partirEnLineas(limpio, anchoMax, tamano, medirAncho, maxLineas, false);
    if (lineas) return { lineas, tamano };
  }

  return { lineas: partirEnLineas(limpio, anchoMax, tamanoMinimo, medirAncho, maxLineas, true), tamano: tamanoMinimo };
}

function partirEnLineas(texto, anchoMax, tamano, medirAncho, maxLineas, forzar) {
  const palabras = texto.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return [''];

  // Wrap completo primero (todas las líneas que hagan falta), recién después se decide si entra
  // en `maxLineas`. Volcar el remanente sin medir (como hacía la versión anterior) dejaba líneas
  // más anchas que la caja incluso en el camino "no forzado" (BUGS.md #1).
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const prueba = actual ? `${actual} ${palabra}` : palabra;
    if (!actual || medirAncho(prueba, tamano) <= anchoMax) {
      actual = prueba;
    } else {
      lineas.push(actual);
      actual = palabra;
    }
  }
  if (actual) lineas.push(actual);

  if (lineas.length > maxLineas) {
    if (!forzar) return null;
    // último recurso: se fusiona el excedente en la última línea permitida; puede superar el
    // ancho — lo tapa el clip del dibujo real (ver componer.js), nunca se sale de la caja.
    const primeras = lineas.slice(0, maxLineas - 1);
    const resto = lineas.slice(maxLineas - 1).join(' ');
    return [...primeras, resto];
  }
  if (!forzar && lineas.some((l) => medirAncho(l, tamano) > anchoMax)) return null;
  return lineas;
}

/** Cover-fit (como CSS background-size:cover): qué recorte del origen entra en la caja destino. */
export function calcularRecorteCover({ anchoOrigen, altoOrigen, anchoDestino, altoDestino }) {
  const escalaOrigen = anchoOrigen / altoOrigen;
  const escalaDestino = anchoDestino / altoDestino;
  let sw = anchoOrigen;
  let sh = altoOrigen;
  if (escalaOrigen > escalaDestino) {
    // el origen es más ancho que el destino: recortar los costados
    sw = altoOrigen * escalaDestino;
  } else {
    // el origen es más alto: recortar arriba/abajo
    sh = anchoOrigen / escalaDestino;
  }
  const sx = (anchoOrigen - sw) / 2;
  const sy = (altoOrigen - sh) / 2;
  return { sx, sy, sw, sh };
}
