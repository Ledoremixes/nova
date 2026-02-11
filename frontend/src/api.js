const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000/api';

// ======================
// Helpers
// ======================
function authHeaders(token) {
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    /aborted/i.test(err?.message || '') ||
    /AbortError/i.test(String(err || ''))
  );
}

/**
 * fetchWithTimeout
 * - timeoutMs > 0  -> abort dopo timeout
 * - timeoutMs = 0  -> NO timeout (mai abort)
 */
async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  if (!timeoutMs || timeoutMs <= 0) {
    return fetch(url, options);
  }

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

/**
 * fetchWithRetry
 * - utile per Render free: 1 retry su AbortError e su 502/503/504
 */
async function fetchWithRetry(
  url,
  options = {},
  {
    timeoutMs = 20000,
    retryCount = 1,
    backoffMs = 1200,
    retryOnStatuses = [502, 503, 504]
  } = {}
) {
  let lastErr = null;

  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);

      // server in warmup -> 502/503/504
      if (!res.ok && retryOnStatuses.includes(res.status) && attempt < retryCount) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }

      return res;
    } catch (err) {
      lastErr = err;

      // AbortError tipico su cold start/timeout
      if (isAbortError(err) && attempt < retryCount) {
        await sleep(backoffMs * (attempt + 1));
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

async function request(
  path,
  { method = 'GET', body, token, timeoutMs, retryCount, backoffMs } = {}
) {
  const url = `${BASE_URL}${path}`;

  let res;
  try {
    res = await fetchWithRetry(
      url,
      {
        method,
        headers: authHeaders(token),
        body: body ? JSON.stringify(body) : undefined
      },
      {
        timeoutMs: timeoutMs ?? 20000,
        retryCount: retryCount ?? 1,
        backoffMs: backoffMs ?? 1200,
        retryOnStatuses: [502, 503, 504]
      }
    );
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error(
        'Il server si sta avviando (Render free). Riprova tra qualche secondo.'
      );
    }
    throw err;
  }

  // 204 no content
  if (res.status === 204) return null;

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const msg = json?.error || json?.message || text || 'Errore API';
    throw new Error(msg);
  }

  return json ?? null;
}

// ======================
// Mini cache in-memory
// ======================
const memCache = new Map(); // key -> { value, exp }
function cacheGet(key) {
  const v = memCache.get(key);
  if (!v) return null;
  if (Date.now() > v.exp) {
    memCache.delete(key);
    return null;
  }
  return v.value;
}
function cacheSet(key, value, ttlMs) {
  memCache.set(key, { value, exp: Date.now() + ttlMs });
  return value;
}

// Cache anche su localStorage (solo per accounts)
const LS_ACCOUNTS_KEY = 'gestionale_accounts_cache_v1';
const LS_ACCOUNTS_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function loadAccountsFromLS() {
  try {
    const raw = localStorage.getItem(LS_ACCOUNTS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed?.data)) return null;
    if (Date.now() - parsed.ts > LS_ACCOUNTS_TTL_MS) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

function saveAccountsToLS(data) {
  try {
    localStorage.setItem(LS_ACCOUNTS_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore
  }
}

// ======================
// API
// ======================
export const api = {
  // ----------------------
  // HEALTH (cold start friendly)
  // ----------------------
  health() {
    // ✅ Render free può metterci >8s al primo hit
    return request('/health', { timeoutMs: 20000, retryCount: 1, backoffMs: 1500 });
  },

  // ----------------------
  // AUTH
  // ----------------------
  register(email, password) {
    return request('/auth/register', {
      method: 'POST',
      body: { email, password },
      timeoutMs: 30000,
      retryCount: 1
    });
  },

  login(email, password) {
    return request('/auth/login', {
      method: 'POST',
      body: { email, password },
      timeoutMs: 45000, // ✅ login può essere cold-start
      retryCount: 1,
      backoffMs: 1600
    });
  },

  me(token, { force = false } = {}) {
    const key = `me:${token || ''}`;
    if (!force) {
      const cached = cacheGet(key);
      if (cached) return Promise.resolve(cached);
    }
    return request('/auth/me', { token, timeoutMs: 25000, retryCount: 1 }).then((data) =>
      cacheSet(key, data, 60 * 1000)
    );
  },

  // ----------------------
  // DASHBOARD
  // ----------------------
  // ✅ non usarla nel warmup. chiamala solo quando l'utente entra nella pagina
  getDashboard(token) {
    return request('/dashboard', { token, timeoutMs: 35000, retryCount: 1 });
  },

  getDashboardPublic(token) {
    return request('/dashboard/public', { token, timeoutMs: 25000, retryCount: 1 });
  },

  // ----------------------
  // ENTRIES
  // ----------------------
  getEntries(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    if (filters.withoutAccount) params.append('withoutAccount', 'true');
    if (filters.accountCode) params.append('accountCode', filters.accountCode);
    if (filters.vatRate) params.append('vatRate', filters.vatRate);
    if (filters.page) params.append('page', String(filters.page));
    if (filters.pageSize) params.append('pageSize', String(filters.pageSize));

    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/entries${q}`, { token, timeoutMs: 30000, retryCount: 1 });
  },

  createEntry(token, form) {
    return request('/entries', {
      method: 'POST',
      token,
      timeoutMs: 30000,
      retryCount: 1,
      body: {
        date: form.date,
        description: form.description,
        amountIn: form.amountIn,
        amountOut: form.amountOut,
        accountCode: form.accountCode,
        method: form.method,
        center: form.center,
        note: form.note,
        nature: form.nature,
        vatRate: form.vatRate,
        vatAmount: form.vatAmount
      }
    });
  },

  deleteEntry(token, id) {
    return request(`/entries/${id}`, { method: 'DELETE', token, timeoutMs: 30000, retryCount: 1 });
  },

  updateEntryNature(token, id, nature) {
    return request(`/entries/${id}/nature`, {
      method: 'PATCH',
      token,
      timeoutMs: 30000,
      retryCount: 1,
      body: { nature }
    });
  },

  updateEntryMeta(token, id, fields) {
    return request(`/entries/${id}/meta`, {
      method: 'PATCH',
      token,
      timeoutMs: 30000,
      retryCount: 1,
      body: fields
    });
  },

  // ----------------------
  // ACCOUNTS (cache forte)
  // ----------------------
  async getAccounts(token, { force = false } = {}) {
    const memKey = `accounts:${token || ''}`;

    if (!force) {
      const mem = cacheGet(memKey);
      if (mem) return mem;

      const ls = loadAccountsFromLS();
      if (ls) {
        cacheSet(memKey, ls, 5 * 60 * 1000);

        // refresh in background senza bloccare UI
        request('/accounts', { token, timeoutMs: 30000, retryCount: 1 })
          .then((fresh) => {
            const data = Array.isArray(fresh) ? fresh : (fresh?.data || fresh?.accounts || []);
            saveAccountsToLS(data);
            cacheSet(memKey, data, 5 * 60 * 1000);
          })
          .catch(() => {});
        return ls;
      }
    }

    const res = await request('/accounts', { token, timeoutMs: 30000, retryCount: 1 });
    const data = Array.isArray(res) ? res : (res?.data || res?.accounts || []);
    saveAccountsToLS(data);
    cacheSet(memKey, data, 5 * 60 * 1000);
    return data;
  },

  createAccount(token, data) {
    return request('/accounts', { method: 'POST', token, timeoutMs: 30000, retryCount: 1, body: data });
  },

  updateAccount(token, id, data) {
    return request(`/accounts/${id}`, { method: 'PATCH', token, timeoutMs: 30000, retryCount: 1, body: data });
  },

  deleteAccount(token, id) {
    return request(`/accounts/${id}`, { method: 'DELETE', token, timeoutMs: 30000, retryCount: 1 });
  },

  // ----------------------
  // REPORT
  // ----------------------
  getReportSummary(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/report/summary${q}`, { token, timeoutMs: 60000, retryCount: 1 });
  },

  getFullReport(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/report/full${q}`, { token, timeoutMs: 60000, retryCount: 1 });
  },

  getIvaMonthlyByNature(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/report/iva/monthly-nature${q}`, { token, timeoutMs: 60000, retryCount: 1 });
  },

  // ----------------------
  // STATS
  // ----------------------
  getDashboardStats(token, filters = {}) {
    const params = new URLSearchParams();
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/stats/dashboard${q}`, { token, timeoutMs: 45000, retryCount: 1 });
  },

  getBarStats(token, filters = {}, forceRefresh = false) {
    const params = new URLSearchParams();
    if (filters.from) params.append('from', filters.from);
    if (filters.to) params.append('to', filters.to);
    if (forceRefresh) params.append('refresh', '1');

    const q = params.toString() ? `?${params.toString()}` : '';
    return request(`/stats/bar${q}`, { token, timeoutMs: 60000, retryCount: 1 });
  },

  // ----------------------
  // ADMIN USERS
  // ----------------------
  adminListUsers(token) {
    return request('/admin/users', { token, timeoutMs: 30000, retryCount: 1 });
  },

  adminCreateUser(token, payload) {
    return request('/admin/users', { method: 'POST', token, timeoutMs: 30000, retryCount: 1, body: payload });
  },

  adminDeleteUser(token, id) {
    return request(`/admin/users/${id}`, { method: 'DELETE', token, timeoutMs: 30000, retryCount: 1 });
  },

  adminDisableUser(token, id) {
    return request(`/admin/users/${id}/disable`, { method: 'PATCH', token, timeoutMs: 30000, retryCount: 1 });
  },

  adminEnableUser(token, id) {
    return request(`/admin/users/${id}/enable`, { method: 'PATCH', token, timeoutMs: 30000, retryCount: 1 });
  },

  adminResetPassword(token, id, password) {
    return request(`/admin/users/${id}/reset-password`, {
      method: 'POST',
      token,
      timeoutMs: 30000,
      retryCount: 1,
      body: password ? { password } : {}
    });
  },

  adminListAudit(token, limit = 100) {
    return request(`/admin/audit?limit=${limit}`, { token, timeoutMs: 30000, retryCount: 1 });
  },

  // ----------------------
  // TESSERATI
  // ----------------------
  getTesserati(token) {
    return request('/tesserati', { token, timeoutMs: 30000, retryCount: 1 });
  },

  createTesserato(token, payload) {
    return request('/tesserati', { method: 'POST', token, timeoutMs: 30000, retryCount: 1, body: payload });
  },

  updateTesserato(token, id, payload) {
    return request(`/tesserati/${id}`, { method: 'PATCH', token, timeoutMs: 30000, retryCount: 1, body: payload });
  },

  deleteTesserato(token, id) {
    return request(`/tesserati/${id}`, { method: 'DELETE', token, timeoutMs: 30000, retryCount: 1 });
  },

  previewImportTesserati(token, rows) {
    return request('/tesserati/import/preview', {
      method: 'POST',
      token,
      body: { rows },
      timeoutMs: 90000,
      retryCount: 1
    });
  },

  commitImportTesserati(token, actions) {
    return request('/tesserati/import/commit', {
      method: 'POST',
      token,
      body: { actions },
      timeoutMs: 180000,
      retryCount: 1,
      backoffMs: 1600
    });
  },

  // ----------------------
  // WARMUP (LIGHT)
  // ----------------------
  warmupAfterLogin(token, user) {
    // ✅ Non bloccare l'utente con chiamate pesanti.
    // ✅ Scalda server + pre-cache conti e /me (veloci).
    setTimeout(() => {
      this.health().catch(() => {});
      this.getAccounts(token).catch(() => {});
      this.me(token).catch(() => {});
      // ❌ niente dashboard qui: la carichi quando l'utente entra nella pagina dashboard
    }, 0);
  }
};
