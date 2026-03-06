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

  async get(path, params = {}) {
    const token = await this.getToken();
    const url = new URL(`${this.baseUrl}${path}`);

    // Standard Accelo fields/pagination params
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }

    const resp = await fetch(url.toString(), {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Accelo API error ${resp.status} on ${path}: ${text}`);
    }

    const json = await resp.json();

    // Accelo wraps responses in { response: [...], meta: {...} }
    if (json.response !== undefined) {
      return { data: json.response, meta: json.meta || {} };
    }
    return { data: json, meta: {} };
  }

  async post(path, body = {}, params = {}) {
    const token = await this.getToken();
    const url = new URL(`${this.baseUrl}${path}`);

    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        url.searchParams.set(k, String(v));
      }
    }

    const formBody = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined && v !== null && v !== '') {
        formBody.set(k, String(v));
      }
    }

    const resp = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: formBody.toString(),
      signal: AbortSignal.timeout(this.timeoutMs),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Accelo API error ${resp.status} on POST ${path}: ${text}`);
    }

    const json = await resp.json();

    if (json.response !== undefined) {
      return { data: json.response, meta: json.meta || {} };
    }
    return { data: json, meta: {} };
  }
}

module.exports = { AcceloClient };
