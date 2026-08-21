import { escapeHtml, colorToTintedWhite } from '../utils/helpers.js';
import { DateUtils } from '../utils/DateUtils.js';

export class AppointmentForm {
  #appointmentTypes;
  #appointment;
  #initialDate;
  #initialTime;
  #allowBlankSchedule;
  #onSave;
  #onDelete;
  #onCancel;
  #element;
  #boundKeyDown;

  /**
   * `allowBlankSchedule` controls the date/time defaults: the header's
   * "+ Add Appointment" button leaves it false (defaults to today / 9am as
   * a convenience), while the Unscheduled column's "+ Add" leaves both
   * blank since the whole point is "I don't know when yet".
   */
  constructor({
    appointmentTypes,
    appointment = null,
    initialDate = null,
    initialTime = null,
    allowBlankSchedule = false,
    onSave,
    onDelete,
    onCancel,
  }) {
    this.#appointmentTypes = appointmentTypes;
    this.#appointment = appointment;
    this.#initialDate = initialDate;
    this.#initialTime = initialTime;
    this.#allowBlankSchedule = allowBlankSchedule;
    this.#onSave = onSave;
    this.#onDelete = onDelete;
    this.#onCancel = onCancel;
    this.#boundKeyDown = this.#handleKeyDown.bind(this);
    this.#element = this.#build();
  }

  get element() {
    return this.#element;
  }

  mount(container) {
    container.appendChild(this.#element);
    document.addEventListener('keydown', this.#boundKeyDown);
    // this.#element.querySelector('input[name="personName"]').focus();
  }

  unmount() {
    document.removeEventListener('keydown', this.#boundKeyDown);
    this.#element.remove();
  }

  #handleKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      this.#onCancel(); // discard silently, same as clicking Cancel
    }
  }

  #build() {
    const isEditing = Boolean(this.#appointment);

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const typeOptions = this.#appointmentTypes
      .map((t) => `<option style="background-color: ${colorToTintedWhite(t.color, 0.75, 1)}; border-color: ${t.color};" value="${t.id}">${escapeHtml(t.name)} (${t.defaultDurationMinutes} min)</option>`)
      .join('');

    const editingDate = this.#appointment?.appointmentDate ?? null;
    const editingTime = this.#appointment?.startTime ?? null;
    const defaultDate = editingDate ?? this.#initialDate ?? '';
    const defaultTime = editingTime ?? this.#initialTime ?? '';
    const defaultTypeId = this.#appointment?.appointmentTypeId ?? this.#appointmentTypes[0]?.id;
    const defaultDuration =
      this.#appointment?.durationMinutes ??
      this.#appointmentTypes.find((t) => t.id === defaultTypeId)?.defaultDurationMinutes ??
      30;
    const durationOptions = (()=>{
      const ops = [];
      const maxDuration = Math.max(...this.#appointmentTypes.map(t => t.defaultDurationMinutes));
      for (let d = 15; d <= maxDuration; d += 15) {
        ops.push(`<option value="${d}"${d === defaultDuration ? ' selected' : ''}>${d} min</option>`);
      }
      return ops.join('');
    })();

    overlay.innerHTML = `
      <div class="modal appointment-form">
        <h2>${isEditing ? 'Edit Appointment' : 'New Appointment'}</h2>
        <form novalidate>
          <label>
            Person
            <input autocomplete="off" type="text" name="personName" required value="${escapeHtml(this.#appointment?.personName ?? '')}" />
          </label>
          <label>
            Type
            <select autocomplete="off" name="appointmentTypeId">${typeOptions}</select>
          </label>
          <label>
            Duration (minutes)
            <select autocomplete="off" name="durationMinutes" required value="${defaultDuration}">${durationOptions}</select>
          </label>
          <div class="form-row">
            <label>
              Date
              <input autocomplete="off" type="date" name="appointmentDate" value="${defaultDate}" />
            </label>
            <label>
              Start time
              <input autocomplete="off" type="time" name="startTime" step="900" value="${defaultTime}" />
            </label>
          </div>
          <label>
            Directory link <span class="label-optional">(optional)</span>
            <input autocomplete="off" type="url" name="directoryLink" placeholder="https://..." value="${escapeHtml(this.#appointment?.directoryLink ?? '')}" />
          </label>
          <label>
            Notes
            <textarea autocomplete="off" name="notes" rows="3">${escapeHtml(this.#appointment?.notes ?? '')}</textarea>
          </label>
          <p class="form-error" hidden></p>
          <div class="appointment-form__actions">
            ${isEditing ? '<button type="button" class="btn btn--danger" data-action="delete">Delete</button>' : '<span></span>'}
            <div>
              <button type="button" class="btn btn--ghost" data-action="cancel">Cancel</button>
              <button type="submit" class="btn btn--primary">Save</button>
            </div>
          </div>
        </form>
      </div>
    `;

    const select = overlay.querySelector('select[name="appointmentTypeId"]');
    select.value = String(defaultTypeId);

    const durationInput = overlay.querySelector('select[name="durationMinutes"]');
    const updateType = (updateDuration=true) => {
      const type = this.#appointmentTypes.find((t) => t.id === Number(select.value));
      if (!type) return;
      if (updateDuration)
        durationInput.value = type.defaultDurationMinutes;
      select.style.backgroundColor = colorToTintedWhite(type.color, 0.75, 1);
    };
    updateType(false); // set initial background color for the select
    select.addEventListener('change', updateType);

    overlay.querySelector('[data-action="cancel"]').addEventListener('click', () => this.#onCancel());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.#onCancel();
    });
    if (isEditing) {
      overlay.querySelector('[data-action="delete"]').addEventListener('click', () => this.#onDelete(this.#appointment.id));
    }

    overlay.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const appointmentDate = String(formData.get('appointmentDate') ?? '').trim() || null;
      const startTime = String(formData.get('startTime') ?? '').trim() || null;

      if ((appointmentDate && !startTime) || (!appointmentDate && startTime)) {
        this.#showError('Provide both a date and a start time, or leave both blank for an unscheduled appointment.');
        return;
      }
      if (startTime) {
        const minutePart = startTime.split(':')[1];
        if (!['00', '15', '30', '45'].includes(minutePart)) {
          this.#showError('Start time must be on a 15-minute mark (:00, :15, :30, :45).');
          return;
        }
      }

      const personName = String(formData.get('personName')).trim();
      if (!personName) {
        this.#showError('Please enter a name.');
        return;
      }

      this.#onSave({
        id: this.#appointment?.id ?? null,
        personName,
        appointmentTypeId: Number(formData.get('appointmentTypeId')),
        durationMinutes: Number(formData.get('durationMinutes')),
        appointmentDate,
        startTime,
        directoryLink: String(formData.get('directoryLink') ?? '').trim() || null,
        notes: String(formData.get('notes') ?? '').trim() || null,
      });
    });

    return overlay;
  }

  #showError(message) {
    const el = this.#element.querySelector('.form-error');
    el.textContent = message;
    el.hidden = false;
  }
}
