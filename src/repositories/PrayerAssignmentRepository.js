import { PrayerAssignment } from '../models/PrayerAssignment.js';

export class PrayerAssignmentRepository {
  #apiClient;

  constructor(apiClient) {
    this.#apiClient = apiClient;
  }

  async getAll() {
    const raw = await this.#apiClient.get('/prayers/prayer-assignments');
    return raw.map(PrayerAssignment.fromObject);
  }

  async create(fields) {
    const raw = await this.#apiClient.post('/prayers/prayer-assignments', fields);
    return PrayerAssignment.fromObject(raw);
  }

  async update(id, fields) {
    const raw = await this.#apiClient.patch(`/prayers/prayer-assignments/${id}`, fields);
    return PrayerAssignment.fromObject(raw);
  }

  async delete(id) {
    await this.#apiClient.delete(`/prayers/prayer-assignments/${id}`);
  }
}