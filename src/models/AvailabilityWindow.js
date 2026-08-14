export class AvailabilityWindow {
  #id;
  #dayOfWeek; // 0 = Sunday ... 6 = Saturday
  #startTime; // 'HH:MM'
  #endTime;   // 'HH:MM'
  #label;

  constructor({ id, dayOfWeek, startTime, endTime, label = '' }) {
    this.#id = id;
    this.#dayOfWeek = dayOfWeek;
    this.#startTime = startTime;
    this.#endTime = endTime;
    this.#label = label;
  }

  static fromObject(obj) {
    return new AvailabilityWindow({
      id: obj.id,
      dayOfWeek: obj.day_of_week,
      startTime: obj.start_time,
      endTime: obj.end_time,
      label: obj.label ?? '',
    });
  }

  toObject() {
    return {
      id: this.#id,
      day_of_week: this.#dayOfWeek,
      start_time: this.#startTime,
      end_time: this.#endTime,
      label: this.#label,
    };
  }

  get id() { return this.#id; }
  get dayOfWeek() { return this.#dayOfWeek; }
  get startTime() { return this.#startTime; }
  get endTime() { return this.#endTime; }
  get label() { return this.#label; }
}
