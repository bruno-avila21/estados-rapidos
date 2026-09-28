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

## APK — 2026-09-28
- Paquete: `com.estadosrapidos.app`. APK autónomo: la web va adentro (`assets/`, servida por `https://appassets.androidplatform.net/`), anda sin internet (sin permiso INTERNET) y no depende de ningún hosting. Se reparte pasando el `.apk` por WhatsApp.
- Compartir a WhatsApp (varias imágenes juntas), elegir foto (galería/cámara) y guardar el respaldo `.json` pasan por puentes nativos (`movil/app/src/main/java/com/estadosrapidos/app/PuenteArchivos.kt`, objeto JS `Android`): el WebView no tiene `navigator.share` con archivos ni `<a download>` confiable.
- Firma: `D:\Proyectos_Propios\Agentes\llaves\estados-rapidos.jks` + `estados-rapidos.credenciales`, junto a las demás llaves y **fuera del repo**. Sin esa llave no se puede instalar una versión nueva encima (habría que desinstalar y se pierden los datos). Respaldala en el gestor de contraseñas.
- Sin auto-actualización: cada versión es un APK nuevo que se reenvía; instalado encima conserva los datos.
- Build: `movil/build-apk.ps1` (JDK 17, arma `_sitio/` y compila release; aborta si detecta firma de debug). Verificado 2026-09-28: `estados-rapidos-1.0.apk`, 2.84 MB, DN `CN=Estados rapidos, O=Bruno Avila, C=AR` (no debug). Copiado a la raíz del proyecto y a `_INSTALABLES\estados-rapidos\` (hardlink vía `instalables.py`).
- Verificado en emulador (AVD `docuvoz`): arranca sin flash blanco, alta de producto con foto de galería, exportar respaldo (SAF, contenido JSON válido), Publicar con 3 productos abre el chooser de Android con las 3 imágenes + texto, Atrás cierra la hoja de revisión sin salir de la app y desde la lista sí sale. `apk-decompile.py` sobre el release: `debuggable=false`, `allowBackup=false`, 0 secretos, solo la Activity launcher exported (más el receiver estándar de AndroidX profileinstaller, protegido por permiso de firma). No verificado: cámara física (el emulador no tiene una) y medición de `scrollWidth` por WebView DevTools (exige un build debug aparte; visualmente, sin overflow en ninguna pantalla).
