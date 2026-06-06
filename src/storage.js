const DB_NAME = "lifepilot-offline-db";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const STATE_KEY = "app-state";

function openLifePilotDb() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("IndexedDB unavailable"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openLifePilotDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const request = callback(store);

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

export async function loadPersistedState(legacyKey) {
  try {
    const record = await withStore("readonly", (store) => store.get(STATE_KEY));
    if (record?.value) return record.value;
  } catch {
    // localStorage fallback below keeps older browsers usable.
  }

  try {
    const raw = localStorage.getItem(legacyKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export async function savePersistedState(legacyKey, value) {
  try {
    await withStore("readwrite", (store) =>
      store.put({ key: STATE_KEY, value, updatedAt: new Date().toISOString() })
    );
  } catch {
    // Ignore and fall back to localStorage.
  }

  try {
    localStorage.setItem(legacyKey, JSON.stringify(value));
  } catch {
    // Storage can be unavailable in private mode or full devices.
  }
}

export async function clearPersistedState(legacyKey) {
  try {
    await withStore("readwrite", (store) => store.delete(STATE_KEY));
  } catch {
    // Keep clearing the legacy store below.
  }

  try {
    localStorage.removeItem(legacyKey);
  } catch {
    // No-op.
  }
}

export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function estimateStorage() {
  if (!navigator.storage?.estimate) return null;
  try {
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}
