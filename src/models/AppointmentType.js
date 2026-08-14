export class AppointmentType {
  #id;
  #name;
  #defaultDurationMinutes;
  #color;

  constructor({ id, name, defaultDurationMinutes, color = '#6E7480' }) {
    this.#id = id;
    this.#name = name;
    this.#defaultDurationMinutes = defaultDurationMinutes;
    this.#color = color;
  }

  /** Builds an instance from the API's snake_case shape. */
  static fromObject(obj) {
    return new AppointmentType({
      id: obj.id,
      name: obj.name,
      defaultDurationMinutes: obj.default_duration_minutes,
      color: obj.color ?? '#6E7480',
    });
  }

  toObject() {
    return {
      id: this.#id,
      name: this.#name,
      default_duration_minutes: this.#defaultDurationMinutes,
      color: this.#color,
    };
  }

  get id() { return this.#id; }
  get name() { return this.#name; }
  get defaultDurationMinutes() { return this.#defaultDurationMinutes; }
  get color() { return this.#color; }
}
