import { DateUtils } from '../utils/DateUtils.js';

export class Appointment {
  #id;
  #personName;
  #appointmentTypeId;
  #durationMinutes;
  #appointmentDate; // 'YYYY-MM-DD' or null (unscheduled)
  #startTime;        // 'HH:MM' or null (unscheduled)
  #status;
  #notes;
  #directoryLink;
  #createdBy;
  #createdAt;
  #updatedAt;

  constructor({
    id = null,
    personName,
    appointmentTypeId,
    durationMinutes,
    appointmentDate = null,
    startTime = null,
    status = 'scheduled',
    notes = null,
    directoryLink = null,
    createdBy = null,
    createdAt = null,
    updatedAt = null,
  }) {
    this.#id = id;
    this.#personName = personName;
    this.#appointmentTypeId = appointmentTypeId;
    this.#durationMinutes = durationMinutes;
    this.#appointmentDate = appointmentDate;
    this.#startTime = startTime;
    this.#status = status;
    this.#notes = notes;
    this.#directoryLink = directoryLink;
    this.#createdBy = createdBy;
    this.#createdAt = createdAt;
    this.#updatedAt = updatedAt;
  }

  /** Builds an instance from the API's snake_case shape. */
  static fromObject(obj) {
    return new Appointment({
      id: obj.id ?? null,
      personName: obj.person_name,
      appointmentTypeId: obj.appointment_type_id,
      durationMinutes: obj.duration_minutes,
      appointmentDate: obj.appointment_date ?? null,
      startTime: obj.start_time ?? null,
      status: obj.status ?? 'scheduled',
      notes: obj.notes ?? null,
      directoryLink: obj.directory_link ?? null,
      createdBy: obj.created_by ?? null,
      createdAt: obj.created_at ?? null,
      updatedAt: obj.updated_at ?? null,
    });
  }

  /** Back to the API's snake_case shape, for POST/PATCH bodies. */
  toObject() {
    return {
      id: this.#id,
      person_name: this.#personName,
      appointment_type_id: this.#appointmentTypeId,
      duration_minutes: this.#durationMinutes,
      appointment_date: this.#appointmentDate,
      start_time: this.#startTime,
      status: this.#status,
      notes: this.#notes,
      directory_link: this.#directoryLink,
    };
  }

  get id() { return this.#id; }
  get personName() { return this.#personName; }
  get appointmentTypeId() { return this.#appointmentTypeId; }
  get durationMinutes() { return this.#durationMinutes; }
  get appointmentDate() { return this.#appointmentDate; }
  get startTime() { return this.#startTime; }
  get status() { return this.#status; }
  get notes() { return this.#notes; }
  get directoryLink() { return this.#directoryLink; }

  get isUnscheduled() { return this.#startTime == null || this.#appointmentDate == null; }

  /** null when unscheduled — callers must check isUnscheduled first. */
  get startMinutes() { return this.#startTime == null ? null : DateUtils.timeToMinutes(this.#startTime); }
  get endMinutes() { return this.startMinutes == null ? null : this.startMinutes + this.#durationMinutes; }
  get dayOfWeek() { return this.#appointmentDate == null ? null : DateUtils.dayOfWeek(DateUtils.parseISODate(this.#appointmentDate)); }
}
