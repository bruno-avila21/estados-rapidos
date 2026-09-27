# Estados rápidos

Estados de WhatsApp de tus productos en 3 segundos. Una PWA instalable: cargás foto, nombre y
precio de cada producto, tocás **Publicar** y se abre la hoja de compartir de Android con la
imagen ya armada sobre tu plantilla — elegís WhatsApp → Mi estado. Nada se automatiza sobre
WhatsApp: el último toque siempre es tuyo.

**Probala:** https://bruno-avila21.github.io/estados-rapidos/

## Instalar en Android
1. Abrí el link de arriba en Chrome.
2. Menú (⋮) → **Agregar a pantalla de inicio**.
3. Abrila desde el ícono: anda sin barra de navegador, y sigue funcionando sin internet después de
   la primera vez que la abrís.

## Cómo se usa
1. **Productos**: tocá **+** para cargar una foto (galería o cámara), nombre, precio y una
   descripción corta (es la leyenda que se copia al portapapeles al publicar).
2. En la lista podés cambiar el precio de un toque, sin entrar al detalle.
3. **Plantilla**: subí tu imagen de fondo (PNG 1080×1920) y ajustá una sola vez dónde va la foto,
   el nombre y el precio, con vista previa en vivo. Si no subís nada, usa una plantilla sobria por
   defecto.
4. **Publicar**: arma la imagen final, copia la descripción al portapapeles y abre la hoja de
   compartir. Si tu navegador no puede compartir archivos, descarga la imagen directamente.
5. **Respaldo**: antes de cambiar de celular o borrar datos del navegador, exportá un `.json` con
   todo (productos, fotos y plantilla). Para recuperarlo, importalo desde la misma pestaña.

## Para desarrollar
Ver `CLAUDE.md` (cómo correr el servidor local, los tests, y cómo se publica).

## Privacidad
Todo lo que cargás queda **en tu celular** (IndexedDB del navegador). Nada se manda a ningún
servidor propio — este repo es público, pero solo tiene código, nunca tus productos ni fotos. El
único archivo que sale de tu celular es el respaldo que vos mismo bajás a propósito.
