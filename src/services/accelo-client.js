'use strict';

/**
 * Accelo API Client
 * Uses service application (client_credentials) flow — no user interaction needed.
 * Tokens expire after 30 days; we auto-refresh before expiry.
 */

class AcceloClient {
  constructor({ deployment, clientId, clientSecret, timeoutMs = 30_000 }) {
    if (!deployment || !clientId || !clientSecret) {
      throw new Error('AcceloClient requires deployment, clientId, and clientSecret');
    }
    this.deployment = deployment;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.baseUrl = `https://${deployment}.api.accelo.com/api/v0`;
    this.tokenUrl = `https://${deployment}.api.accelo.com/oauth2/v0/token`;
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Build an Accelo _filters string from a map of filter names to values.
   * Handles basic filters like standing(active), object filters like against(company(123)),
   * and combines them with commas.
   * @param {Array<string>} filters - Pre-formatted filter expressions
   * @returns {string} Combined _filters value, or empty string if none
   */
  static buildFilters(filters) {
    const parts = filters.filter(Boolean);
    return parts.length ? parts.join(',') : '';
  }

  async getToken() {
    // Refresh if missing or within 5 minutes of expiry
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt && now < this.tokenExpiresAt - 300_000) {
      return this.accessToken;
    }

    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    const resp = await fetch(this.tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Accelo auth failed (${resp.status}): ${text}`);
    }

    const data = await resp.json();
    if (data.error) {
      throw new Error(`Accelo auth error: ${data.error} — ${data.error_description || ''}`);
    }

    this.accessToken = data.access_token;
    // expires_in is in seconds; default 30 days if not provided
    const expiresIn = (data.expires_in || 2592000) * 1000;
    this.tokenExpiresAt = now + expiresIn;
    return this.accessToken;
  }

  buildUrl(path, params = {}) {
    const url = new URL(`${this.baseUrl}${path}`);

    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }

    return url;
  }

  buildFormBody(body = {}) {
    const formBody = new URLSearchParams();

    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== '') {
        formBody.set(k, String(v));
      }
    }

    return formBody.toString();
  }

  async request(method, path, { params = {}, body } = {}) {
    const token = await this.getToken();
    const url = this.buildUrl(path, params);
    const hasBody = body !== undefined;

    const resp = await fetch(url.toString(), {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
        ...(hasBody ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
      },
      ...(hasBody ? { body: this.buildFormBody(body) } : {}),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Accelo API error ${resp.status} on ${method} ${path}: ${text}`);
    }

    const json = await resp.json();

    // Accelo wraps responses in { response: [...], meta: {...} }
    if (json.response !== undefined) {
      return { data: json.response, meta: json.meta || {} };
    }
    return { data: json, meta: {} };
  }

  async get(path, params = {}) {
    return this.request('GET', path, { params });
  }

  async post(path, body = {}, params = {}) {
    return this.request('POST', path, { body, params });
  }

  async put(path, body = {}, params = {}) {
    return this.request('PUT', path, { body, params });
  }
}

module.exports = { AcceloClient };
