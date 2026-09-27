# Estados rápidos

Estados de WhatsApp de tus productos en 3 segundos. Una PWA instalable: cargás foto, nombre y
precio de cada producto, marcás los que querés publicar (la marca queda guardada), revisás las
imágenes y el texto en una última pantalla y tocás **Compartir** — se abre la hoja de compartir de
Android con una o varias imágenes juntas, elegís WhatsApp → Mi estado. Nada se automatiza sobre
WhatsApp: el último toque siempre es tuyo.

**Probala:** https://bruno-avila21.github.io/estados-rapidos/

## Instalar en Android
1. Abrí el link de arriba en Chrome.
2. Menú (⋮) → **Agregar a pantalla de inicio**.
3. Abrila desde el ícono: anda sin barra de navegador, y sigue funcionando sin internet después de
   la primera vez que la abrís.

## Cómo se usa
1. **Productos**: tocá **+** para cargar una foto (galería o cámara), nombre, precio (opcional: si
   lo dejás vacío, el estado sale sin precio) y, si querés, una descripción propia (si no cargás
   una, se arma sola con el modelo de Ajustes).
2. En la lista podés cambiar el precio de un toque, sin entrar al detalle, y marcar/desmarcar cada
   producto con la casilla (queda guardado: la próxima vez que entrás siguen marcados los mismos).
   "Marcar todos" / "Desmarcar" para hacerlo de una.
3. **Publicar** (de una tarjeta) o **Publicar N** (barra de abajo, con los marcados) abre la
   **hoja de revisión**: se arman las imágenes en secuencia, podés editar el texto y cambiar el
   estilo antes de compartir.
4. **Compartir**: copia el texto al portapapeles y abre la hoja de compartir con todas las
   imágenes juntas (hasta 30, el límite de WhatsApp). Si tu navegador no soporta compartir varios
   archivos, las comparte de a una con un botón "Siguiente"; si no soporta compartir, las descarga.
5. **Ajustes**: elegís el estilo de imagen general tocando una de las 4 tarjetas, cada una con su
   miniatura en vivo — **Solo la foto**, **Foto con precio**, **Foto con descripción** (para que
   el estado lleve su propio texto) o **Mi plantilla** (fondo PNG propio). El modelo de descripción,
   el formato del precio y el **editor de plantilla** (dónde va el nombre, el precio y la
   descripción, con qué tipografía y color — se abre tocando/arrastrando sobre la vista previa)
   están ahí mismo. Cada producto puede tener su propio estilo (en "Opciones avanzadas" del alta/edición).
6. **Respaldo**: antes de cambiar de celular o borrar datos del navegador, exportá un `.json` con
   todo. Para recuperarlo, importalo desde la misma pestaña. "Borrar todos los datos" vacía la app
   (con confirmación) si necesitás empezar de cero.

## Para desarrollar
Ver `CLAUDE.md` (cómo correr el servidor local, los tests, y cómo se publica).

## Privacidad
Todo lo que cargás queda **en tu celular** (IndexedDB del navegador). Nada se manda a ningún
servidor propio — este repo es público, pero solo tiene código, nunca tus productos ni fotos. El
único archivo que sale de tu celular es el respaldo que vos mismo bajás a propósito.
