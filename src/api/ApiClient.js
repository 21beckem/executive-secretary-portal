import { ApiError } from './ApiError.js';

/**
 * Thin fetch wrapper around the Cloudflare Worker API. Not used by default in
 * this first draft (see DummyApiClient) — swap it in from main.js once the
 * Worker is deployed. Auth is a single master password sent as a header,
 * supplied lazily via `getPassword` so AuthGate stays the single source of
 * truth for the current password.
 */
export class ApiClient {
  #baseUrl;
  #getPassword;

  constructor({ baseUrl, getPassword }) {
    this.#baseUrl = baseUrl;
    this.#getPassword = getPassword;
  }

  async #request(method, path, body = null) {
    const headers = { 'Content-Type': 'application/json' };
    const password = this.#getPassword();
    if (password) headers['X-App-Password'] = password;

    const response = await fetch(`${this.#baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      throw new ApiError('Incorrect password.', 401);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new ApiError(text || `Request failed with status ${response.status}`, response.status);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  get(path) { return this.#request('GET', path); }
  post(path, body) { return this.#request('POST', path, body); }
  patch(path, body) { return this.#request('PATCH', path, body); }
  delete(path) { return this.#request('DELETE', path); }
}
