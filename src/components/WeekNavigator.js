import { DateUtils } from '../utils/DateUtils.js';

export class WeekNavigator {
  #weekStart;
  #onChange;
  #onSet;
  #picker;
  #element;

  constructor({ weekStart, onChange, onSet }) {
    this.#weekStart = weekStart;
    this.#onChange = onChange;
    this.#onSet = onSet;
    this.#picker = null;
    this.#element = this.#build();
  }

  get element() {
    return this.#element;
  }

  update(weekStart) {
    this.#weekStart = weekStart;
    this.#picker.setDate(weekStart, true);
  }

  #build() {
    const nav = document.createElement('div');
    nav.className = 'week-navigator';
    nav.innerHTML = `
      <button type="button" class="btn btn--icon" data-action="prev" aria-label="Previous week">&larr;</button>
      <input class="week-navigator__label">
      <button type="button" class="btn btn--icon" data-action="next" aria-label="Next week">&rarr;</button>
      <button type="button" class="btn btn--ghost" data-action="today">Today</button>
    `;
    const self = this;
    this.#picker = flatpickr(nav.querySelector('.week-navigator__label'), {
      plugins: [new weekSelect()],
      disableMobile: true,
      locale: {
        firstDayOfWeek: 0 // Sunday
      },
      defaultDate: this.#weekStart,
      onReady: function(selectedDates, dateStr, instance) {
        instance.input.value = DateUtils.formatWeekRange(instance.weekStartDay);
      },
      onChange: function(selectedDates, dateStr, instance) {
        instance.input.value = DateUtils.formatWeekRange(instance.weekStartDay);
        self.#onSet(instance.weekStartDay);
      }
    });
    nav.querySelector('[data-action="prev"]').addEventListener('click', () => this.#onChange(-1));
    nav.querySelector('[data-action="next"]').addEventListener('click', () => this.#onChange(1));
    nav.querySelector('[data-action="today"]').addEventListener('click', () => this.#onChange(0));
    return nav;
  }
}
