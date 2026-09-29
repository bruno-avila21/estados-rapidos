// Íconos SVG inline de línea (1.5px, sin relleno) — reemplazan los glifos unicode/emoji de la
// piel anterior. Dirección "Organic Minimalist" (ver Interfaz/ANALISIS-STITCH.md): "Iconographic
// Discipline" prohíbe emojis y exige vectores propios, nunca una fuente de íconos remota. Se
// construyen con las mismas primitivas DOM que el resto de js/vistas/*.js (nada de innerHTML).
const NS = 'http://www.w3.org/2000/svg';

// Cada trazo es [tagSvg, atributos]. Coordenadas en un viewBox 0 0 24 24, todas rectas o arcos
// chicos: nada de curvas complejas, para poder revisar a ojo que el ícono cierra bien.
const TRAZOS = Object.freeze({
  lista: [
    ['line', { x1: 4, y1: 6, x2: 20, y2: 6 }],
    ['line', { x1: 4, y1: 12, x2: 20, y2: 12 }],
    ['line', { x1: 4, y1: 18, x2: 20, y2: 18 }],
  ],
  grilla: [
    ['rect', { x: 4, y: 4, width: 7, height: 7, rx: 1.5 }],
    ['rect', { x: 13, y: 4, width: 7, height: 7, rx: 1.5 }],
    ['rect', { x: 4, y: 13, width: 7, height: 7, rx: 1.5 }],
    ['rect', { x: 13, y: 13, width: 7, height: 7, rx: 1.5 }],
  ],
  ajustes: [
    ['line', { x1: 4, y1: 6, x2: 20, y2: 6 }],
    ['circle', { cx: 9, cy: 6, r: 2 }],
    ['line', { x1: 4, y1: 12, x2: 20, y2: 12 }],
    ['circle', { cx: 15, cy: 12, r: 2 }],
    ['line', { x1: 4, y1: 18, x2: 20, y2: 18 }],
    ['circle', { cx: 11, cy: 18, r: 2 }],
  ],
  // Nav inferior "Respaldo" (Material "backup"): nube + flecha subiendo — antes eran 2 flechas
  // sueltas (import/export), sin forma de nube; redibujado para la comparación con el diseño Stitch.
  respaldo: [
    ['path', { d: 'M7 18a4 4 0 0 1-.6-7.96A5 5 0 0 1 16.2 8.2 4.5 4.5 0 0 1 17 17h-1' }],
    ['line', { x1: 12, y1: 11, x2: 12, y2: 19 }],
    ['polyline', { points: '9,14 12,11 15,14' }],
  ],
  // Nav inferior "Productos" (Material "inventory_2"): caja con tapa — distinto del glifo `lista`
  // (view_list, 3 líneas) que se usa en el conmutador Lista/Grilla; comparten forma antes por error.
  inventario: [
    ['rect', { x: 3.5, y: 9, width: 17, height: 11, rx: 1.5 }],
    ['path', { d: 'M3 8.5 5.5 4.5h13L21 8.5' }],
    ['line', { x1: 9.5, y1: 13, x2: 14.5, y2: 13 }],
  ],
  // Botón "Secciones" del filtro (Material "settings"): engranaje — antes usaba `etiqueta`, que
  // sigue existiendo para el estado vacío (semántica distinta, no se toca).
  engranaje: [
    ['circle', { cx: 12, cy: 12, r: 2.8 }],
    ['path', {
      d: 'M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.7 6.3l-1.7 1.7M8 16l-1.7 1.7M17.7 17.7 16 16M8 8 6.3 6.3',
    }],
  ],
  // Ícono "add" (Material "add"): cruz — el FAB usaba el carácter "+" de texto, no un SVG.
  agregar: [
    ['line', { x1: 12, y1: 5, x2: 12, y2: 19 }],
    ['line', { x1: 5, y1: 12, x2: 19, y2: 12 }],
  ],
  // Ícono "send" (Material "send"): avión de papel — barra de publicar fija (lista) y acción
  // "Compartir en WhatsApp" de la grilla.
  enviar: [['path', { d: 'M4 12 20 4 13 20 11 13 4 12z' }], ['line', { x1: 11, y1: 13, x2: 20, y2: 4 }]],
  // Ícono "share" (Material "share"): 3 puntos conectados — barra de publicar fija de la grilla
  // (productos_vista_grilla_natural usa "share", no "send").
  compartir: [
    ['circle', { cx: 18, cy: 6, r: 2.3 }],
    ['circle', { cx: 6, cy: 12, r: 2.3 }],
    ['circle', { cx: 18, cy: 18, r: 2.3 }],
    ['line', { x1: 8.1, y1: 10.8, x2: 15.9, y2: 7.2 }],
    ['line', { x1: 8.1, y1: 13.2, x2: 15.9, y2: 16.8 }],
  ],
  // Ícono "select_all" (Material): 4 esquinas punteadas — botón "Marcar todos".
  todos: [
    ['path', { d: 'M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8' }],
    ['path', { d: 'M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8' }],
    ['path', { d: 'M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16' }],
    ['path', { d: 'M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16' }],
    ['rect', { x: 9, y: 9, width: 6, height: 6, rx: 1 }],
  ],
  // Ícono "info" (Material): tarjeta "Consejo de publicación".
  info: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['line', { x1: 12, y1: 11, x2: 12, y2: 16 }],
    ['line', { x1: 12, y1: 7.6, x2: 12, y2: 7.8 }],
  ],
  buscar: [
    ['circle', { cx: 10, cy: 10, r: 6 }],
    ['line', { x1: 14.5, y1: 14.5, x2: 20, y2: 20 }],
  ],
  vacio: [
    ['circle', { cx: 12, cy: 12, r: 8 }],
    ['line', { x1: 8, y1: 12, x2: 16, y2: 12 }],
  ],
  etiqueta: [
    ['rect', { x: 4, y: 4, width: 16, height: 16, rx: 3 }],
    ['circle', { cx: 9, cy: 9, r: 1.6 }],
  ],
  camara: [
    ['rect', { x: 3, y: 7, width: 18, height: 13, rx: 2 }],
    ['path', { d: 'M8 7l2-3h4l2 3' }],
    ['circle', { cx: 12, cy: 13.5, r: 3.5 }],
  ],
  subir: [
    ['line', { x1: 12, y1: 4, x2: 12, y2: 15 }],
    ['polyline', { points: '8,8 12,4 16,8' }],
    ['path', { d: 'M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3' }],
  ],
  borrar: [
    ['line', { x1: 4, y1: 7, x2: 20, y2: 7 }],
    ['path', { d: 'M6 7v13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7' }],
    ['path', { d: 'M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3' }],
    ['line', { x1: 10, y1: 11, x2: 10, y2: 17 }],
    ['line', { x1: 14, y1: 11, x2: 14, y2: 17 }],
  ],
  volver: [['polyline', { points: '15,6 9,12 15,18' }]],
  deshacer: [
    ['polyline', { points: '9,7 4,12 9,17' }],
    ['path', { d: 'M4 12h11a5 5 0 0 1 0 10h-1' }],
  ],
  rehacer: [
    ['polyline', { points: '15,7 20,12 15,17' }],
    ['path', { d: 'M20 12H9a5 5 0 0 0 0 10h1' }],
  ],
  // "Acomodar" (editar_plantilla_natural, ícono "center_focus_strong"): 4 escuadras de esquina +
  // punto central — mismo lenguaje visual que un foco de cámara centrando el encuadre.
  acomodar: [
    ['path', { d: 'M4 9V6a2 2 0 0 1 2-2h3' }],
    ['path', { d: 'M20 9V6a2 2 0 0 0-2-2h-3' }],
    ['path', { d: 'M4 15v3a2 2 0 0 0 2 2h3' }],
    ['path', { d: 'M20 15v3a2 2 0 0 1-2 2h-3' }],
    ['circle', { cx: 12, cy: 12, r: 2.5 }],
  ],
  // "Restablecer" (ícono "restart_alt"): flecha circular con un corte, como un botón de reinicio.
  restablecer: [
    ['path', { d: 'M4 12a8 8 0 1 1 3 6.24' }],
    ['polyline', { points: '4,17 4,12 9,12' }],
  ],
  ojo: [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  'ojo-tachado': [
    ['path', { d: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['line', { x1: 3, y1: 3, x2: 21, y2: 21 }],
  ],
  'flecha-arriba': [['polyline', { points: '6,15 12,9 18,15' }]],
  'flecha-abajo': [['polyline', { points: '6,9 12,15 18,9' }]],
  copiar: [
    ['rect', { x: 8, y: 8, width: 12, height: 12, rx: 2 }],
    ['path', { d: 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2' }],
  ],
  // Editar precio en modal (Fase 3 "M" #2) y "Editar" en grilla: lápiz de línea simple.
  lapiz: [
    ['path', { d: 'M4 20l1-4.5L15.5 5 19 8.5 8.5 19 4 20z' }],
    ['line', { x1: 13.5, y1: 6.5, x2: 17, y2: 10 }],
  ],
  'flecha-izquierda': [['polyline', { points: '15,6 9,12 15,18' }]],
  'flecha-derecha': [['polyline', { points: '9,6 15,12 9,18' }]],
  // Manija de arrastre (Fase 3 "M" #1, reordenar en la hoja de revisión): 2 filas de puntos.
  arrastrar: [
    ['circle', { cx: 8, cy: 9, r: 1.4 }],
    ['circle', { cx: 16, cy: 9, r: 1.4 }],
    ['circle', { cx: 8, cy: 15, r: 1.4 }],
    ['circle', { cx: 16, cy: 15, r: 1.4 }],
  ],
  // Fase 5 (editar_producto_natural/gesti_n_de_secciones_natural/respaldo_natural): íconos nuevos
  // que no existían en el reskin de lista/grilla.
  // "photo_library": marco trasero + esquina del de adelante — botón "Galería" del editor de foto.
  galeria: [
    ['rect', { x: 3, y: 3, width: 14, height: 14, rx: 2 }],
    ['path', { d: 'M7 21h12a2 2 0 0 0 2-2V7' }],
  ],
  // "check": tilde de línea — botón "Guardar" y chip de sección activo.
  check: [['polyline', { points: '5,13 10,18 19,7' }]],
  // "folder_open": tarjetas "Tus secciones"/"Restaurar catálogo".
  carpeta: [
    ['path', { d: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z' }],
  ],
  // Estado del respaldo local (sin cloud real detrás, solo el archivo .json del celular).
  escudo: [
    ['path', { d: 'M12 3.5 19 6.2v5c0 5-3.5 8.3-7 9.3-3.5-1-7-4.3-7-9.3v-5l7-2.7z' }],
    ['polyline', { points: '9,12 11,14 15,10' }],
  ],
  // "calendar_today": preset de sección "Publicaciones de Lunes".
  calendario: [
    ['rect', { x: 4, y: 5, width: 16, height: 15, rx: 2 }],
    ['line', { x1: 4, y1: 10, x2: 20, y2: 10 }],
    ['line', { x1: 8, y1: 3, x2: 8, y2: 7 }],
    ['line', { x1: 16, y1: 3, x2: 16, y2: 7 }],
  ],
  // "percent": preset de sección "Liquidación de temporada".
  porcentaje: [
    ['line', { x1: 6, y1: 18, x2: 18, y2: 6 }],
    ['circle', { cx: 7.5, cy: 7.5, r: 2 }],
    ['circle', { cx: 16.5, cy: 16.5, r: 2 }],
  ],
  // "local_fire_department": preset de sección "Destacados del mes".
  fuego: [
    ['path', { d: 'M12 3.2c1 2.6-2.6 3.6-2.6 6.4a2.6 2.6 0 0 0 5.2 0c0-.8-.6-1.5-.6-1.5 1.6.9 2.6 2.6 2.6 4.4a5 5 0 0 1-10 0c0-4 3.6-4.9 5.4-9.3z' }],
  ],
  // "add_circle": cruz dentro de un círculo — cabecera "Nueva sección" (distinto de `agregar`,
  // que es la cruz sola, usada en botones y chips).
  'agregar-circulo': [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['line', { x1: 12, y1: 8.5, x2: 12, y2: 15.5 }],
    ['line', { x1: 8.5, y1: 12, x2: 15.5, y2: 12 }],
  ],
  // "sell": etiqueta de precio (pentágono con un agujerito) — contador "N productos" de Secciones.
  // Distinto de `etiqueta` (cuadrado con un punto), que ya se usa como ícono genérico de estado
  // vacío en Productos y no se toca.
  tag: [
    ['path', { d: 'M11.5 4h5.5a2 2 0 0 1 2 2v5.5a2 2 0 0 1-.59 1.41l-7.5 7.5a2 2 0 0 1-2.82 0l-5.5-5.5a2 2 0 0 1 0-2.82l7.5-7.5A2 2 0 0 1 11.5 4z' }],
    ['circle', { cx: 15.5, cy: 8.5, r: 1.4 }],
  ],
  // "auto_awesome": destello de 4 puntas — cabecera de "Plantillas sugeridas".
  chispa: [
    ['line', { x1: 12, y1: 3, x2: 12, y2: 9 }],
    ['line', { x1: 12, y1: 15, x2: 12, y2: 21 }],
    ['line', { x1: 3, y1: 12, x2: 9, y2: 12 }],
    ['line', { x1: 15, y1: 12, x2: 21, y2: 12 }],
    ['line', { x1: 5.5, y1: 5.5, x2: 9.5, y2: 9.5 }],
    ['line', { x1: 14.5, y1: 14.5, x2: 18.5, y2: 18.5 }],
  ],
  // Tanda ajustes_de_publicaci_n_natural / confirmar_publicaci_n_natural (rediseño-organic).
  // "crop": esquinas de encuadre — cabecera de la sección "Encuadre de la foto".
  recortar: [
    ['path', { d: 'M7 3v14a2 2 0 0 0 2 2h12' }],
    ['path', { d: 'M17 21V7a2 2 0 0 0-2-2H3' }],
  ],
  // "aspect_ratio": marco con marcas en las esquinas — opción "Entera" del encuadre.
  'encuadre-entero': [
    ['rect', { x: 4, y: 6, width: 16, height: 12, rx: 1.5 }],
    ['path', { d: 'M7 9V7.5A0.5 0.5 0 0 1 7.5 7H9' }],
    ['path', { d: 'M15 17h1.5a0.5 0.5 0 0 0 0.5-0.5V15' }],
  ],
  // "fullscreen": 4 esquinas abriéndose hacia afuera — opción "Llenar la pantalla" del encuadre.
  'pantalla-completa': [
    ['path', { d: 'M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9' }],
    ['path', { d: 'M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9' }],
    ['path', { d: 'M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15' }],
    ['path', { d: 'M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15' }],
  ],
  // "payments": billete con una monedita encima — cabecera "Prefijo y puntuación monetaria".
  moneda: [
    ['rect', { x: 3, y: 7, width: 14, height: 10, rx: 2 }],
    ['circle', { cx: 10, cy: 12, r: 2.4 }],
    ['path', { d: 'M17.5 9.5H19a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2h-1.5' }],
  ],
  // "swap_vert": flecha doble vertical — hint "Reordenar" de la secuencia de publicación.
  'reordenar-vertical': [
    ['polyline', { points: '8,9 8,4 5,7' }],
    ['line', { x1: 8, y1: 4, x2: 8, y2: 19 }],
    ['polyline', { points: '16,15 16,20 19,17' }],
    ['line', { x1: 16, y1: 20, x2: 16, y2: 5 }],
  ],
  // "close": cruz — botón "Descartar producto" de la hoja de revisión.
  equis: [
    ['line', { x1: 6, y1: 6, x2: 18, y2: 18 }],
    ['line', { x1: 18, y1: 6, x2: 6, y2: 18 }],
  ],
  // "content_paste": portapapeles con solapa y renglones — "Texto listo para pegar".
  portapapeles: [
    ['rect', { x: 5, y: 4, width: 14, height: 17, rx: 2 }],
    ['rect', { x: 9, y: 2.5, width: 6, height: 3, rx: 1 }],
    ['line', { x1: 8, y1: 11, x2: 16, y2: 11 }],
    ['line', { x1: 8, y1: 15, x2: 13, y2: 15 }],
  ],
  // "public": globo terráqueo simplificado — "Destino de publicación".
  planeta: [
    ['circle', { cx: 12, cy: 12, r: 8.5 }],
    ['ellipse', { cx: 12, cy: 12, rx: 3.5, ry: 8.5 }],
    ['line', { x1: 3.7, y1: 9, x2: 20.3, y2: 9 }],
    ['line', { x1: 3.7, y1: 15, x2: 20.3, y2: 15 }],
  ],
  // "chevron_right": flecha chica a la derecha — filas "<label + valor> · Cambiar ›".
  'chevron-derecha': [['polyline', { points: '9,6 15,12 9,18' }]],
});

/**
 * Crea un <svg class="icono" aria-hidden="true"> de línea para reemplazar un emoji/glifo.
 * `nombre` tiene que existir en TRAZOS (si no, devuelve un <svg> vacío en vez de romper el
 * render — mismo criterio defensivo que el resto de la app ante datos inesperados).
 */
export function crearIcono(nombre, { clase = 'icono' } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (clase) svg.setAttribute('class', clase);
  for (const [tag, attrs] of TRAZOS[nombre] ?? []) {
    const el = document.createElementNS(NS, tag);
    for (const [clave, valor] of Object.entries(attrs)) el.setAttribute(clave, String(valor));
    svg.append(el);
  }
  return svg;
}
