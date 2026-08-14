import { AvailabilityWindow } from '../models/AvailabilityWindow.js';

export class AvailabilityRepository {
  #apiClient;

  constructor(apiClient) {
    this.#apiClient = apiClient;
  }

  async getAll() {
    const raw = await this.#apiClient.get('/availability');
    return raw.map(AvailabilityWindow.fromObject);
  }
}
