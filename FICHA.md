# Ficha — estados-rapidos

> Lo que el código no cuenta. La zona **AUTO** la regenera `node bin/ficha.js` (desde
> `Agentes/centro`); el resto lo escribís vos y el generador no lo pisa.
>
> **Regla:** acá van *nombres* de variables y *de dónde* se obtienen. Nunca un valor.
> Por eso esta ficha se puede commitear y un agente la puede leer entera.

<!-- AUTO:inicio -->
## Cómo está hecho

| Dato | Valor |
| --- | --- |
| Stack | HTML + CSS + JS (módulos ES), sin build ni dependencias de runtime |
| Repo | https://github.com/bruno-avila21/estados-rapidos |
| Despliegue configurado | GitHub Pages, rama `main`, raíz `/` |
| Puerto (dev local) | 8080 (`node scripts/servir.js`) |
<!-- AUTO:fin -->

## Variables
| Variable | De dónde se saca | Estado |
| --- | --- | --- |
| `(ninguna)` | — | no hay backend ni `.env`: todo el dato es local al navegador (IndexedDB) |

## Dónde está subido

| Qué | URL | Cuenta / proveedor |
| --- | --- | --- |
| Producción | https://bruno-avila21.github.io/estados-rapidos/ | GitHub Pages, cuenta `bruno-avila21` |
| Prueba / staging | — | no aplica (sin build; `main` es lo que se ve) |

## Contexto

| Dato | Valor |
| --- | --- |
| Cliente | Bruno (uso propio, un solo negocio) |
| Estado | producción |
| Qué hace | Arma y comparte el estado de WhatsApp de un producto (foto + nombre + precio sobre una plantilla propia) en 3 segundos, sin automatizar WhatsApp |
| No tocar | Los datos de producto (fotos, nombres, precios) NUNCA van al repo — viven solo en el IndexedDB de cada instalación. El repo es público (decisión de Bruno, mismo caso que `cv`): revisar antes de commitear que no se cuele nada de las capturas de `docs/` con datos reales si algún día dejan de ser de prueba |

## APK (TWA) — 2026-09-28
- Paquete: `com.estadosrapidos.app`. Es una Trusted Web Activity: abre la web en Chrome a pantalla completa, así compartir a WhatsApp funciona igual que en la web.
- Firma: `D:\Proyectos_Propios\_firmas\estados-rapidos\` (`firma.keystore` + `clave.env`), **fuera del repo**. Sin esa llave no se puede publicar una actualización del APK. Respaldala.
- Verificación del dominio: `.well-known/assetlinks.json` (huella SHA-256 de esa firma). Sin eso el APK abre con la barra de la dirección.
