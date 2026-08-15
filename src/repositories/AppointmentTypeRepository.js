import { AppointmentType } from '../models/AppointmentType.js';

export class AppointmentTypeRepository {
  #apiClient;

  constructor(apiClient) {
    this.#apiClient = apiClient;
  }

  async getAll() {
    const raw = await this.#apiClient.get('/appointments/appointment-types');
    return raw.map(AppointmentType.fromObject);
  }
}
