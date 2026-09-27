---
description: Corre los revisores del proyecto (ciberseguridad, ux, animacion, performance, escalabilidad, mantenibilidad, interfaces) y deja MEJORAS.md. Uso — /mejorar [eje|todo] [--aplicar]
argument-hint: [eje | todo] [--aplicar]
---

# /mejorar — el proyecto sigue mejorando después de creado

Argumentos: **$ARGUMENTS**

Ejes disponibles (son los agentes en `.claude/agents/` de este proyecto):
`qa-e2e` · `ciberseguridad` · `ux` · `animacion` · `performance` · `escalabilidad` · `mantenibilidad` · `interfaces`

## Qué hacer

1. **Elegir ejes.** Si `$ARGUMENTS` nombra uno o varios, esos. Si dice `todo` o está vacío → los 8. **`qa-e2e` corre siempre primero**: si da NO LISTO, los demás ejes se corren igual pero el veredicto global es NO LISTO.
   Si hay `CREAR-BRIEF.md`, leelo primero: los hallazgos se juzgan contra lo que el proyecto
   *quiere* ser, no contra un ideal genérico.
2. **Lanzar los agentes en paralelo** (un `Agent` por eje, `subagent_type` = nombre del eje).
   A cada uno pasale: la raíz del proyecto, el brief resumido en 5 líneas, y la instrucción de
   devolver su markdown tal cual lo define su plantilla.
3. **Consolidar** en `MEJORAS.md` (sobrescribir; el historial está en git):
   ```
   # Mejoras — <fecha>
   | Eje | Score | Primero haría |
   |---|---|---|
   ...
   ## Alta (todas, de todos los ejes)
   ## Media
   ## Baja
   ## No se pudo verificar
   ```
   Deduplicar: si dos ejes señalan el mismo `archivo:línea`, una entrada con ambas etiquetas.
4. **Si hay `--aplicar`:** tomar solo las de severidad **alta** que tengan arreglo de una frase,
   aplicarlas una por una, correr tests/build después de cada una, y marcar en `MEJORAS.md`
   `✔ aplicado` o `✘ no se pudo: <motivo>`. Nada de severidad media/baja sin preguntar.
   Nunca aplicar algo que toque auth, pagos, borrado o firma sin confirmación explícita.
5. Si hubo hallazgos altos: correr **`/aprender`** sobre ellos (¿qué agente, receta o regla del proyecto debió evitarlos?) y dejar el spec de regresión en `test/e2e/regresion.spec.js`.
6. Cerrar con: scores por eje, cuántos hallazgos altos, qué se aplicó, qué aprendió el sistema, y **una** sugerencia de próximo `/mejorar <eje>`.

## Especialistas por dominio
Además de los 8 ejes, si el proyecto entra en un dominio, sumá el auditor que corresponde (ver `~/.claude/crear-kit/recetas/auditoria.md`): `web-design-guidelines` (UI), `vercel-react-best-practices` (React/Next), `vercel-optimize` (costo en Vercel), `writing-guidelines` (docs), `mattpocock-skills:code-review` (código vs. spec), `impeccable /audit` (calidad visual), **Strix** (seguridad ofensiva con PoC). Corren aparte y sus hallazgos entran a `MEJORAS.md` con su origen.

## Cuándo correrlo
- Antes de cada release: `/mejorar qa-e2e ciberseguridad performance`.
- Después de cualquier cambio que toque UI: `/mejorar qa-e2e`.
- Después de una pantalla nueva: `/mejorar ux animacion`.
- Cada tanto, todo: `/mejorar todo`.
