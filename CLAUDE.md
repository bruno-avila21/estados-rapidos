# CLAUDE.md — estados-rapidos

## Qué es
PWA para armar en 3 segundos el estado de WhatsApp de un producto: foto + nombre + precio montados
sobre una plantilla propia (1080×1920), y un botón **Publicar** que copia la descripción al
portapapeles y abre la hoja de compartir de Android (`navigator.share`) para elegir WhatsApp → Mi
estado. Sin backend, sin build, sin dependencias de runtime. Todo el dato vive en el IndexedDB del
celular de quien la usa — el repo es público pero solo tiene código, nunca datos de producto.

Fuente de verdad del alcance: `CREAR-BRIEF.md`.

## Cómo se prueba localmente
No abrir `index.html` con doble clic: el Service Worker y `navigator.share`/`clipboard` necesitan un
origen `http(s)` (o `localhost`), no `file://`. Levantar el servidor estático propio:

```bash
npm install            # una vez (solo trae @playwright/test, de test)
node scripts/servir.js # o: npm run servir
```

Imprime la URL local y la IP de LAN — desde el Android, en la misma wifi, "Agregar a pantalla de
inicio" para instalarla igual que en producción.

Tests:
```bash
npm test          # unidad: node --test (modelo, layout, respaldo, estrategia del SW)
npm run test:e2e  # Playwright, viewport 412x915 (Chromium)
npm run test:todo # ambos
```

## Cómo se publica
GitHub Pages sirve la raíz de `main` en `https://bruno-avila21.github.io/estados-rapidos/`. No hay
paso de build: lo que está en `main` es lo que se sirve. Un push a `main` se refleja solo (unos
minutos de propagación de Pages).

Para regenerar los íconos PNG (192/512, maskable) sin dependencias: `npm run iconos`
(`scripts/generar-iconos.js`, dibuja el PNG a mano con `node:zlib`, igual técnica que
`claude-GUIA-USO/bin/guia.js iconos`).

## Las 8 reglas de UI (obligatorias, de `patrones.md`)
1. Tokens CSS en `:root` (`css/estilos.css`); nada de estilos inline en el HTML.
2. Toda interacción con `hover`, `focus-visible`, `active`, `disabled` + transición 200ms.
3. Un H1 por pantalla (`#titulo-pantalla`), escala tipográfica fija, 2 pesos máximo.
4. Sin gradientes decorativos, sin una card por cada dato, sin colores fuera de los tokens.
5. Estados vacío / carga / error **diseñados** (nunca "Loading..." pelado): ver `js/vistas/lista.js`
   (`estadoVacio`), skeleton en la carga, `[role=alert]` en los errores.
6. Móvil primero: acciones principales (Publicar, Guardar) abajo, pulgar-friendly; targets ≥ 48px.
7. `prefers-reduced-motion` respetado (`css/estilos.css`, media query al final).
8. Divulgación progresiva: foto+nombre+precio siempre a la vista; descripción agrupada bajo un
   título; ajustes finos de la plantilla detrás de la pestaña "Plantilla" (no en la lista).

## Antes de un release
`/mejorar ciberseguridad performance`

## Los datos de usuario nunca van al repo
Productos, fotos y plantilla personalizada viven **solo** en el IndexedDB del navegador de quien
instala la app. El único archivo que sale del celular es el respaldo `.json` que Bruno baja a
propósito desde la pestaña "Respaldo" — y ese archivo tampoco se commitea (ver `.gitignore`: los
`.tmp-respaldo-*.json` que generan los tests E2E están explícitamente ignorados).

## Mapa del código
- `js/modelo.js` — reglas puras: formato de precio (es-AR), validación de producto y de respaldo.
- `js/layout.js` — cálculo puro de wrap de texto y cover-fit (sin canvas; recibe un medidor inyectado).
- `js/componer.js` — dibuja plantilla + foto + textos en un canvas 1080×1920 → Blob PNG.
- `js/db.js` / `js/repositorio.js` — IndexedDB y las operaciones de dominio sobre ella.
- `js/vistas/*.js` — las 4 pantallas (lista, detalle, plantilla, respaldo).
- `js/utils/*.js` — toast, confirmación propia (nunca `confirm()` nativo), compartir/descargar, achicar fotos.
- `sw.js` + `js/sw-estrategia.js` — Service Worker network-first, con la decisión de cacheo separada como función pura y testeada.
