/**
 * Mock KV helper for testing Vercel serverless functions
 *
 * Usage in tests:
 *   import { createKVMock, mockKV } from './helpers/kv-mock.js';
 *
 *   beforeEach(() => {
 *     mockKV(vi, { 'vibe:handles': { seth: { genesis: true } } });
 *   });
 */

// In-memory store for mock KV
export function createKVMock(initialData = {}) {
  const store = {
    strings: {},      // Simple key-value
    hashes: {},       // Hash structures
    lists: {},        // List structures
    sets: {}          // Set structures
  };

  // Initialize with provided data
  Object.entries(initialData).forEach(([key, value]) => {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      store.hashes[key] = value;
    } else if (Array.isArray(value)) {
      store.lists[key] = value;
    } else {
      store.strings[key] = value;
    }
  });

  return {
    // String operations
    get: async (key) => store.strings[key] || null,
    set: async (key, value) => { store.strings[key] = value; return 'OK'; },
    del: async (key) => { delete store.strings[key]; return 1; },

    // Hash operations
    hget: async (key, field) => store.hashes[key]?.[field] || null,
    hset: async (key, field, value) => {
      if (!store.hashes[key]) store.hashes[key] = {};
      store.hashes[key][field] = value;
      return 1;
    },
    hgetall: async (key) => store.hashes[key] || null,
    hincrby: async (key, field, increment) => {
      if (!store.hashes[key]) store.hashes[key] = {};
      store.hashes[key][field] = (parseInt(store.hashes[key][field] || 0) + increment);
      return store.hashes[key][field];
    },

    // List operations
    lpush: async (key, ...values) => {
      if (!store.lists[key]) store.lists[key] = [];
      store.lists[key].unshift(...values);
      return store.lists[key].length;
    },
    lrange: async (key, start, stop) => {
      const list = store.lists[key] || [];
      return list.slice(start, stop === -1 ? undefined : stop + 1);
    },
    llen: async (key) => (store.lists[key] || []).length,
    ltrim: async (key, start, stop) => {
      if (store.lists[key]) {
        store.lists[key] = store.lists[key].slice(start, stop + 1);
      }
      return 'OK';
    },

    // Set operations
    sadd: async (key, ...members) => {
      if (!store.sets[key]) store.sets[key] = new Set();
      let added = 0;
      members.forEach(m => {
        if (!store.sets[key].has(m)) {
          store.sets[key].add(m);
          added++;
        }
      });
      return added;
    },
    smembers: async (key) => Array.from(store.sets[key] || []),
    sismember: async (key, member) => store.sets[key]?.has(member) ? 1 : 0,

    // Expiry (no-op in mock)
    expire: async () => 1,

    // Internal access for test assertions
    _store: store
  };
}

// Helper to mock @vercel/kv module
export function mockKV(vi, initialData = {}) {
  const kvMock = createKVMock(initialData);

  vi.mock('@vercel/kv', () => ({
    kv: kvMock
  }));

  return kvMock;
}

// Create mock request object
export function createMockRequest(overrides = {}) {
  return {
    method: 'GET',
    url: '/api/test',
    query: {},
    body: null,
    headers: {},
    ...overrides
  };
}

// Create mock response object
export function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,

    status(code) {
      this.statusCode = code;
      return this;
    },

    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },

    json(data) {
      this.body = data;
      return this;
    },

    end() {
      return this;
    },

    redirect(code, url) {
      this.statusCode = code;
      this.headers['Location'] = url;
      return this;
    }
  };

  return res;
}
