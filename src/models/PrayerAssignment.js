export class PrayerAssignment {
  #id;
  #date;
  #openingPrayerName;
  #openingConfirmed;
  #closingPrayerName;
  #closingConfirmed;

  constructor({
    id,
    date,
    openingPrayerName = null,
    openingConfirmed = false,
    closingPrayerName = null,
    closingConfirmed = false,
  }) {
    this.#id = id;
    this.#date = date;
    this.#openingPrayerName = openingPrayerName;
    this.#openingConfirmed = openingConfirmed;
    this.#closingPrayerName = closingPrayerName;
    this.#closingConfirmed = closingConfirmed;
  }

  static fromObject(obj) {
    return new PrayerAssignment({
      id: obj.id,
      date: obj.date,
      openingPrayerName: obj.opening_prayer_name ?? null,
      openingConfirmed: Boolean(obj.opening_confirmed),
      closingPrayerName: obj.closing_prayer_name ?? null,
      closingConfirmed: Boolean(obj.closing_confirmed),
    });
  }

  toObject() {
    return {
      id: this.#id,
      date: this.#date,
      opening_prayer_name: this.#openingPrayerName,
      opening_confirmed: this.#openingConfirmed,
      closing_prayer_name: this.#closingPrayerName,
      closing_confirmed: this.#closingConfirmed,
    };
  }

  get id() { return this.#id; }
  get date() { return this.#date; }
  get openingPrayerName() { return this.#openingPrayerName; }
  get openingConfirmed() { return this.#openingConfirmed; }
  get closingPrayerName() { return this.#closingPrayerName; }
  get closingConfirmed() { return this.#closingConfirmed; }
}