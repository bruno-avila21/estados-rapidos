// Decisión pura de estrategia de cacheo por URL. Sin `self`, sin Cache API: testeable con node:test
// e importable desde sw.js (module worker). Ver receta pwa.md: nunca cache-first puro para código.
export function tipoDeCache(urlComoTexto) {
  const url = new URL(urlComoTexto);
  if (/\/icons\/.+\.png$/.test(url.pathname)) return 'cache-first';
  return 'network-first';
}
