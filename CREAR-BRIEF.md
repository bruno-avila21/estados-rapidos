# estados-rapidos

**Idea original:** Miniapp para el celular (PWA/web móvil) para publicar estados de WhatsApp de forma semi-automática, sin riesgo de baneo: tarjetas de productos con precio editable rápido; la app monta texto y precio sobre una plantilla de imagen y genera la imagen final; botón "Publicar" usa la Web Share API (`navigator.share({ files, text })`) para abrir la hoja de compartir de Android → WhatsApp → Mi estado. 3 segundos por producto, sin scripts ni Tasker.
**Familia:** web instalable (PWA)      **Nuevo / feature de:** proyecto nuevo
**Fecha:** 2026-09-26

## Qué tiene que existir al final
Una PWA en GitHub Pages, instalada en el Android de Bruno, con sus productos cargados. Tocando uno, cambia el precio si hace falta, toca **Publicar** y en la hoja de compartir elige WhatsApp → Mi estado. Cero automatización sobre WhatsApp: el último toque siempre es humano.

## El mínimo del primer día
Cargar un producto (foto + nombre + precio), cargar la plantilla, ver la imagen 1080×1920 armada y compartirla a WhatsApp con **Publicar**.

## Decisiones tomadas
| Tema | Decisión | Por qué |
|---|---|---|
| Usuarios | Solo Bruno, un negocio | Sin login ni multi-cuenta |
| Productos | Se cargan en la app: foto (galería/cámara), nombre, precio, descripción | Sin servidor ni dependencia de otro sistema |
| Imagen | Plantilla PNG propia 1080×1920 + foto del producto + nombre + precio en posiciones fijas, que se ajustan una vez en una pantalla de "Plantilla" | La marca es de Bruno, no un diseño genérico |
| Publicar | `navigator.share({ files: [png], text })`. Antes de compartir se copia la descripción al portapapeles (WhatsApp puede ignorar el `text` en estados: se pega como leyenda) | Sin riesgo de baneo: la acción final la hace el usuario |
| Fallback | Si `navigator.canShare({files})` da falso: botón **Descargar imagen** | Navegadores sin Web Share con archivos |
| Stack | HTML + JS sin build. Canvas para componer, IndexedDB para guardar, service worker network-first (receta `pwa.md`) | GitHub Pages lo sirve tal cual; se arregla desde cualquier lado |
| Datos | Todo en el celular (IndexedDB). Nada en el repo | El repo es público: solo código |
| Respaldo | Exportar/importar un archivo `.json` con productos, fotos (en base64) y plantilla | Cambiar de celu o borrar datos del navegador sin perder nada |
| Pantallas | Lista de tarjetas (foto, nombre, precio editable en línea, botón Publicar) → detalle/edición → Plantilla → Respaldo | Tarea diaria y repetitiva: todo a un toque desde la lista |
| Hosting | GitHub Pages, **repo público** (decisión de Bruno; mismo caso que `cv`) | Gratis, HTTPS (obligatorio para compartir archivos) |

## Qué se reusa del ecosistema
- Receta `pwa.md` → manifest, iconos PNG, SW network-first, aviso de versión nueva.
- Generador de iconos PNG sin dependencias de `claude-GUIA-USO/bin/guia.js iconos` o de `centro`.
- `animaciones` → solo microinteracciones (toque en Publicar, guardado); nada decorativo.

## Fuera de alcance (por ahora)
- Publicar solo, programar estados o cualquier automatización sobre WhatsApp (riesgo de baneo).
- Leer el catálogo de stock-product/Vaultec.
- Varias marcas, login, venderla a terceros.
- APK nativo.

## Publicación y costo
**Dónde vive:** GitHub Pages (`bruno-avila21.github.io/estados-rapidos`), sin dominio propio.
| Rubro | Mensual | Anual | Nota |
|---|---|---|---|
| Hosting | 0 | 0 | GitHub Pages |
| Dominio | 0 | 0 | Subdominio de github.io |
| Construcción con Claude Code | | una vez | ~6-10 invocaciones |
| TOTAL | 0 | 0 | |
Checklist: HTTPS (lo da Pages) · sin secretos en el repo · `.gitignore` · CSP estricta (sin scripts externos) · `start_url`/`scope` con el subpath `/estados-rapidos/`.

## Alineación ISO
Controles 27001: A.8.10 borrado de información (los datos no salen del celu salvo el respaldo que baja Bruno), A.8.13 respaldo (export/import), A.8.28 codificación segura (sin `innerHTML` con datos de usuario, CSP). Fuera de alcance: control de acceso (un solo usuario, datos locales).
Calidad 25010: ver `CALIDAD.md`.

## Cómo sabemos que está terminado
- [ ] Instalada desde Chrome Android con "Agregar a pantalla de inicio" y abre sin barra.
- [ ] Alta de producto con foto de la galería y de la cámara.
- [ ] Cambiar el precio desde la lista sin entrar al detalle.
- [ ] La imagen 1080×1920 sale con plantilla, foto, nombre y precio en su lugar (captura).
- [ ] **Publicar** abre la hoja de compartir con la imagen; WhatsApp → Mi estado la acepta (prueba real de Bruno).
- [ ] Exportar, borrar datos, importar: vuelve todo.
- [ ] Anda offline después de la primera carga.
- [ ] Tests de la composición y del respaldo (`node --test`) y QA con `qa-e2e` en viewport móvil.

## Preguntas que quedaron abiertas
- Si WhatsApp respeta el `text` como leyenda del estado o hay que pegarlo (se prueba en el celu; el portapapeles cubre los dos casos).
- Formato del precio (`$ 12.500`, con o sin decimales) y tipografía de la plantilla: se ajustan en la pantalla Plantilla.
