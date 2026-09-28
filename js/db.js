// IndexedDB mínimo, sin dependencias. Todo el estado de la app vive acá (nada en el repo).
const NOMBRE_DB = 'estados-rapidos';
// v2: agrega el store 'secciones' (etiquetas tipo "Lunes"/"Lencería", un producto puede tener
// varias — CREAR-BRIEF.md, ronda "secciones"). onupgradeneeded solo AGREGA lo que falta: instalar
// esta versión encima de una v1 con productos cargados no toca 'productos'/'blobs'/'config' para
// nada, los datos existentes quedan intactos.
const VERSION_DB = 2;

let promesaDb = null;

function abrir() {
  if (promesaDb) return promesaDb;
  promesaDb = new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(NOMBRE_DB, VERSION_DB);
    solicitud.onupgradeneeded = () => {
      const db = solicitud.result;
      if (!db.objectStoreNames.contains('productos')) {
        const store = db.createObjectStore('productos', { keyPath: 'id' });
        store.createIndex('orden', 'orden');
      }
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('config')) db.createObjectStore('config', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('secciones')) {
        const store = db.createObjectStore('secciones', { keyPath: 'id' });
        store.createIndex('orden', 'orden');
      }
    };
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
  return promesaDb;
}

function transaccion(store, modo) {
  return abrir().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, modo);
        const almacen = tx.objectStore(store);
        resolve(almacen);
        tx.onerror = () => reject(tx.error);
      })
  );
}

export async function obtenerTodos(store) {
  const almacen = await transaccion(store, 'readonly');
  return await new Promise((resolve, reject) => {
    const req = almacen.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function obtener(store, id) {
  const almacen = await transaccion(store, 'readonly');
  return await new Promise((resolve, reject) => {
    const req = almacen.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function guardar(store, valor) {
  const almacen = await transaccion(store, 'readwrite');
  return await new Promise((resolve, reject) => {
    const req = almacen.put(valor);
    req.onsuccess = () => resolve(valor);
    req.onerror = () => reject(req.error);
  });
}

export async function borrar(store, id) {
  const almacen = await transaccion(store, 'readwrite');
  return await new Promise((resolve, reject) => {
    const req = almacen.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function vaciar(store) {
  const almacen = await transaccion(store, 'readwrite');
  return await new Promise((resolve, reject) => {
    const req = almacen.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function pedirAlmacenamientoPersistente() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* no crítico */
  }
  return false;
}
