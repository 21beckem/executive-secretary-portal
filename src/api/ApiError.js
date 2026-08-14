export class ApiError extends Error {
  #status;

  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.#status = status;
  }

  get status() { return this.#status; }
}
