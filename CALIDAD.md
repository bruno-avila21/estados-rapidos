# Calidad — estados-rapidos

## ISO/IEC 25010 — calidad del producto

| Característica | Pregunta | Cómo se verifica acá |
|---|---|---|
| Adecuación funcional | ¿Hace lo del brief, completo y correcto? | `CREAR-BRIEF.md` §"Cómo sabemos que está terminado"; 30 tests unitarios (`npm test`) + 17 E2E (`npm run test:e2e`) cubren alta con foto, precio en línea, plantilla, publicar (mock), exportar/importar. Pendiente de Bruno: que WhatsApp acepte la imagen en "Mi estado" (no automatizable sin riesgo de baneo). |
| Eficiencia de desempeño | ¿Tiempos, recursos, tokens? | Sin build ni dependencias de runtime: la app pesa lo que pesan sus propios archivos (< 50 KB de JS+CSS). Fotos redimensionadas a máx. 1600 px / JPEG 0.85 antes de guardar (`js/utils/imagen.js`) para no llenar IndexedDB. Composición de la imagen final: un solo canvas 1080×1920, sin librerías. |
| Compatibilidad | ¿Convive con otros sistemas? | No depende de ningún backend ni API de terceros. Standalone: `manifest.webmanifest` con `start_url`/`scope` relativos para convivir bajo `/estados-rapidos/` en GitHub Pages. |
| Usabilidad | ¿Aprendible, accesible, protege de errores? | 8 reglas de `patrones.md`: tokens en `:root`, `hover/focus-visible/active/disabled`, un H1 por pantalla, sin gradientes decorativos, estados vacío/carga/error diseñados, móvil primero (targets ≥ 48px, acciones abajo), `prefers-reduced-motion`, divulgación progresiva (foto/nombre/precio primero, descripción agrupada, ajustes de plantilla detrás de la pestaña "Plantilla"). Confirmación de borrado propia (nunca `confirm()` nativo). |
| Fiabilidad | ¿Madurez, disponibilidad, tolerancia a fallos, recuperable? | Service Worker network-first con fallback a caché (`sw.js` + `js/sw-estrategia.js`, testeado con `node --test` y con un smoke E2E real). `window.onerror`/`unhandledrejection` muestran un cartel legible en vez de pantalla rota. Respaldo exportable/importable (`js/repositorio.js`) — probado con ida y vuelta real por la UI (`test/e2e/respaldo.spec.js`) y con `node --test` (`test/respaldo.test.js`). |
| Seguridad | ¿Confidencialidad, integridad, no repudio, trazabilidad? | Ver `SEGURIDAD.md`. Sin backend: no hay superficie de red propia. CSP estricta, sin `innerHTML` con datos de usuario, validación de todo archivo importado. |
| Mantenibilidad | ¿Modular, reusable, analizable, testeable? | Capas separadas: `modelo.js` (reglas puras), `layout.js` (cálculo de texto, puro), `componer.js` (dibujo, DOM), `repositorio.js` (datos), `vistas/*.js` (UI). Las funciones puras se testean con `node --test` sin DOM ni canvas real (se inyecta un medidor de texto simulado). |
| Portabilidad | ¿Se instala/adapta a otro host o dispositivo? | HTML+JS+CSS planos, sin build: se sirve desde cualquier host estático con HTTPS (GitHub Pages, y también `scripts/servir.js` en la LAN de Bruno). Instalable como PWA en Android ("Agregar a pantalla de inicio"). |

## Alineación ISO 27001 (Anexo A) — lo que este proyecto puede implementar solo

| Control | Qué significa acá | Evidencia |
|---|---|---|
| A.8.10 Borrado de información | Los datos no salen del celular salvo que Bruno exporte un respaldo a propósito; borrar un producto borra también su foto (`js/repositorio.js:borrarProducto`) | código + `test/e2e/estados.spec.js` |
| A.8.13 Respaldo | Exportar/importar `.json` con productos, fotos en base64 y plantilla, con `version` de formato | `js/modelo.js` (`construirRespaldo`/`validarRespaldo`), probado ida y vuelta |
| A.8.28 Codificación segura | Sin `innerHTML` con datos de usuario, sin `eval`, validación de toda entrada externa (el archivo de respaldo) | `SEGURIDAD.md`, revisor `ciberseguridad` |
| A.8.9 Gestión de configuración | Sin config secreta; todo el comportamiento es código versionado | `manifest.webmanifest`, `sw.js` con `VERSION` explícita |
| A.8.32 Gestión de cambios | Git con `main`/`desarrollo`, commits descriptivos, CI (`.github/workflows/test.yml`) corre los tests en cada push | historial de commits |

Fuera de alcance (con motivo): A.5.15/A.5.17 control de acceso y autenticación (un solo usuario, sin
cuentas), A.5.23 servicios en la nube (el único proveedor es GitHub Pages, ya declarado en el brief),
A.8.24 criptografía (no hay datos que cifrar en reposo más allá de lo que el propio navegador decida
para IndexedDB — HTTPS lo da GitHub Pages en tránsito).

## Contraste AA — paleta "Organic Minimalist" (reskin 2026-09-28)

Reemplaza el registro anterior (índigo/violeta, ronda 2026-09-27). Verificado con la fórmula de
contraste relativo de WCAG 2.1 sobre los pares texto/fondo reales de `css/estilos.css`. Umbral AA:
4.5:1 texto normal, 3:1 componentes de UI/texto grande.

**Claro (`:root`, por defecto)**
| Par | Contraste |
|---|---|
| `--color-texto` `#242220` / `--color-fondo` `#fbf9f5` | 15.08:1 |
| `--color-texto-tenue` `#5c584f` / `--color-fondo` `#fbf9f5` | 6.74:1 |
| `--color-texto` `#242220` / `--color-superficie` `#f3efea` | 13.85:1 |
| `--color-texto` `#242220` / `--color-superficie-alta` `#ebe5dd` | 12.67:1 |
| `--color-primario-texto` `#fbf9f5` / `--color-primario` `#3a4d39` (botón primario, FAB, chip activo) | 8.68:1 |
| `--color-acento` `#6e5b49` / `--color-fondo` `#fbf9f5` (nav activa) | 6.13:1 |
| `--color-peligro` `#ba1a1a` / `--color-fondo` `#fbf9f5` (`[role=alert]`) | 6.14:1 |
| `--color-peligro-texto` `#fbf9f5` / `--color-peligro` `#ba1a1a` (botón peligro) | 6.14:1 |

**Oscuro (`prefers-color-scheme: dark` / `[data-theme=dark]`)**
| Par | Contraste |
|---|---|
| `--color-texto` `#efe9e0` / `--color-fondo` `#201e1a` | 13.79:1 |
| `--color-texto-tenue` `#b8b1a4` / `--color-fondo` `#201e1a` | 7.82:1 |
| `--color-primario-texto` `#16210f` / `--color-primario` `#a7bda4` | 8.31:1 |
| `--color-acento` `#dcc2ac` / `--color-fondo` `#201e1a` | 9.79:1 |
| `--color-peligro` `#ffb4a9` / `--color-fondo` `#201e1a` | 9.79:1 |
| `--color-peligro-texto` `#201e1a` / `--color-peligro` `#ffb4a9` | 9.79:1 |

Todos los pares superan 4.5:1 (varios llegan a AAA, 7:1). Calculado con un script Node de una vez
(fórmula estándar de luminancia relativa), no a ojo.

## Cómo se verificó (para que el próximo que lea esto sepa que no es de palabra)
- `npm test` → 67/67 (`test/*.test.js`: modelo, layout, respaldo, estrategia del SW, compartir, geometría del editor).
- `npm run test:e2e` → 33/33 (`test/e2e/*.spec.js`, viewport 412×915, Chromium).
- Verificación manual en navegador con `agent-browser` (viewport 412×915): alta de producto con
  imagen de prueba, cambio de precio en la lista (incluido sin precio), las 4 tarjetas de estilo con
  miniatura en vivo en Ajustes, el editor de plantilla (seleccionar/mover/redimensionar/cambiar
  tipografía y color), Publicar (mock), exportar/importar. Capturas reales en `docs/` (`ajustes.png`,
  `editor-plantilla.png`, un `estilo-*.png` por cada uno de los 4 estilos).
- `impeccable /audit` (detector mecánico) sobre `js/vistas/ajustes.js`, `js/vistas/plantilla.js` y
  `css/estilos.css`: 0 hallazgos. Revisión manual encontró un objetivo táctil chico (la casilla de
  selección de producto, 24×24px) — corregido a 44×44px (`css/estilos.css`, `.tarjeta__seleccion`).
  Las manijas de redimensión del editor (18px) quedan como excepción deliberada: son manipulación de
  precisión (como en Figma/Photoshop), agrandarlas a 44px estorbaría el ajuste fino en un lienzo chico.
- Lo que **no** se pudo verificar en esta sesión: que WhatsApp acepte de verdad la imagen compartida
  en "Mi estado" desde el Android de Bruno — eso requiere el share sheet real de un teléfono, que
  solo Bruno puede probar.
