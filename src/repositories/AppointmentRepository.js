import { Appointment } from '../models/Appointment.js';

export class AppointmentRepository {
  #apiClient;

  constructor(apiClient) {
    this.#apiClient = apiClient;
  }

  async getByDateRange(startISODate, endISODate) {
    const raw = await this.#apiClient.get(`/appointments/appointments?start=${startISODate}&end=${endISODate}`);
    return raw.map(Appointment.fromObject);
  }

  /** Appointments with no date/time yet — always all of them, regardless of week. */
  async getUnscheduled() {
    const raw = await this.#apiClient.get('/appointments/appointments/unscheduled');
    return raw.map(Appointment.fromObject);
  }

  async create(payload) {
    const raw = await this.#apiClient.post('/appointments/appointments', payload);
    return Appointment.fromObject(raw);
  }

  async update(id, changes) {
    const raw = await this.#apiClient.patch(`/appointments/appointments/${id}`, changes);
    return Appointment.fromObject(raw);
  }

  async remove(id) {
    await this.#apiClient.delete(`/appointments/appointments/${id}`);
  }
}
