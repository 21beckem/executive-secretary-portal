import { DateUtils } from '../utils/DateUtils.js';
import { AvailabilityCalculator } from '../services/AvailabilityCalculator.js';
import { DragDropController } from '../services/DragDropController.js';
import { DragCoordinator } from '../services/DragCoordinator.js';
import { WeekNavigator } from './WeekNavigator.js';
import { ScheduleView } from './ScheduleView.js';
import { AppointmentForm } from './AppointmentForm.js';
import { Toast } from './Toast.js';
import { ApiError } from '../api/ApiError.js';

const PIXELS_PER_MINUTE = 1.6; // 96px/hour, 24px per 15-minute slot

export class App {
  #appointmentRepository;
  #appointmentTypeRepository;
  #availabilityRepository;
  #authGate;
  #rootElement;

  #weekNavigator;
  #scheduleView;
  #scheduleContainer;
  #toast;
  #dragDropController;
  #dragCoordinator;

  #appointmentTypes = [];
  #appointmentTypesById = new Map();
  #availabilityCalculator = null;

  #currentWeekStart;
  #currentAppointments = [];
  #unscheduledAppointments = [];
  #activeForm = null;

  constructor({ appointmentRepository, appointmentTypeRepository, availabilityRepository, authGate, rootElement }) {
    this.#appointmentRepository = appointmentRepository;
    this.#appointmentTypeRepository = appointmentTypeRepository;
    this.#availabilityRepository = availabilityRepository;
    this.#authGate = authGate;
    this.#rootElement = rootElement;
    this.#currentWeekStart = DateUtils.getWeekStart(new Date());
    this.#dragDropController = new DragDropController({ pixelsPerMinute: PIXELS_PER_MINUTE });
    this.#dragCoordinator = new DragCoordinator({ dragDropController: this.#dragDropController });
    this.#toast = new Toast();
  }

  async init() {
    this.#rootElement.innerHTML = '';
    this.#buildStaticLayout();

    try {
      const [types, windows] = await Promise.all([
        this.#appointmentTypeRepository.getAll(),
        this.#availabilityRepository.getAll(),
      ]);
      this.#appointmentTypes = types;
      this.#appointmentTypesById = new Map(types.map((t) => [t.id, t]));
      this.#availabilityCalculator = new AvailabilityCalculator(windows);

      this.#scheduleView = new ScheduleView({
        availabilityCalculator: this.#availabilityCalculator,
        dragDropController: this.#dragDropController,
        dragCoordinator: this.#dragCoordinator,
        onSlotClick: (date, time) => this.#openForm({ initialDate: date, initialTime: time }),
        onAppointmentMove: (id, target) => this.#moveAppointment(id, target),
        onAppointmentEdit: (appointment) => this.#openForm({ appointment }),
        onAddUnscheduled: () => this.#openForm({ allowBlankSchedule: true }),
      });
      this.#scheduleContainer.appendChild(this.#scheduleView.element);

      // for back-button on mobile detection
      window.history.pushState(null, null, window.location.href);
      window.addEventListener('popstate', function (event) {
        window.history.pushState(null, null, window.location.href);

        document.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Escape',
            code: 'Escape',
            keyCode: 27,
            which: 27,
            bubbles: true,
            cancelable: true
          })
        );
      });

      await this.#loadWeek();
    } catch (err) {
      await this.#handleError(err);
    }
  }

  #buildStaticLayout() {
    const header = document.createElement('header');
    header.className = 'app-header';
    header.innerHTML = `<h1>Executive Secretary Portal</h1>`;

    // const addButton = document.createElement('button');
    // addButton.type = 'button';
    // addButton.className = 'btn btn--primary';
    // addButton.textContent = '+ Add Appointment';
    // addButton.addEventListener('click', () => this.#openForm());
    // header.appendChild(addButton);

    this.#weekNavigator = new WeekNavigator({
      weekStart: this.#currentWeekStart,
      onChange: (direction) => this.#changeWeek(direction),
      onSet: (weekStartDate) => this.#setWeek(weekStartDate),
    });

    this.#scheduleContainer = document.createElement('div');
    this.#scheduleContainer.className = 'schedule-container';

    this.#rootElement.appendChild(header);
    this.#rootElement.appendChild(this.#weekNavigator.element);
    this.#rootElement.appendChild(this.#scheduleContainer);
  }

  async #changeWeek(direction) {
    this.#currentWeekStart =
      direction === 0 ? DateUtils.getWeekStart(new Date()) : DateUtils.addDays(this.#currentWeekStart, direction * 7);
    this.#weekNavigator.update(this.#currentWeekStart);
    await this.#loadWeek();
  }

  async #setWeek(weekStartDate) {
    this.#currentWeekStart = weekStartDate;
    await this.#loadWeek();
  }

  async #loadWeek() {
    try {
      const start = DateUtils.toISODate(this.#currentWeekStart);
      const end = DateUtils.toISODate(DateUtils.addDays(this.#currentWeekStart, 6));
      const [scheduled, unscheduled] = await Promise.all([
        this.#appointmentRepository.getByDateRange(start, end),
        this.#appointmentRepository.getUnscheduled(),
      ]);
      this.#currentAppointments = scheduled;
      this.#unscheduledAppointments = unscheduled;
      this.#renderSchedule();
    } catch (err) {
      await this.#handleError(err);
    }
  }

  #renderSchedule() {
    this.#scheduleView.render({
      weekStart: this.#currentWeekStart,
      appointments: this.#currentAppointments,
      unscheduledAppointments: this.#unscheduledAppointments,
      appointmentTypesById: this.#appointmentTypesById,
    });
  }

  #openForm({ appointment = null, initialDate = null, initialTime = null, allowBlankSchedule = false } = {}) {
    if (this.#activeForm) this.#activeForm.unmount();
    this.#activeForm = new AppointmentForm({
      appointmentTypes: this.#appointmentTypes,
      appointment,
      initialDate,
      initialTime,
      allowBlankSchedule,
      onSave: (payload) => this.#saveAppointment(payload),
      onDelete: (id) => this.#deleteAppointment(id),
      onCancel: () => this.#closeForm(),
    });
    this.#activeForm.mount(this.#rootElement);
  }

  #closeForm() {
    if (this.#activeForm) {
      this.#activeForm.unmount();
      this.#activeForm = null;
    }
  }

  async #saveAppointment(payload) {
    try {
      const changes = {
        person_name: payload.personName,
        appointment_type_id: payload.appointmentTypeId,
        duration_minutes: payload.durationMinutes,
        appointment_date: payload.appointmentDate,
        start_time: payload.startTime,
        directory_link: payload.directoryLink,
        notes: payload.notes,
      };

      if (payload.id) {
        await this.#appointmentRepository.update(payload.id, changes);
        this.#toast.show('Appointment updated.', { type: 'success' });
      } else {
        await this.#appointmentRepository.create(changes);
        this.#toast.show('Appointment created.', { type: 'success' });
      }
      this.#closeForm();
      await this.#loadWeek();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        this.#toast.show('That time is already taken \u2014 pick a different time.', { type: 'error' });
      } else {
        await this.#handleError(err);
      }
    }
  }

  async #deleteAppointment(id) {
    try {
      await this.#appointmentRepository.remove(id);
      this.#toast.show('Appointment deleted.', { type: 'success' });
      this.#closeForm();
      await this.#loadWeek();
    } catch (err) {
      await this.#handleError(err);
    }
  }

  /** `target` is { appointmentDate, startTime } — either may be null (dropped on Unscheduled). */
  async #moveAppointment(id, target) {
    try {
      await this.#appointmentRepository.update(id, {
        appointment_date: target.appointmentDate,
        start_time: target.startTime,
      });
      this.#toast.show(target.startTime ? 'Appointment moved.' : 'Appointment unscheduled.', { type: 'success' });
      await this.#loadWeek();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        this.#toast.show('That time is already taken.', { type: 'error' });
        await this.#loadWeek(); // re-fetch so the block snaps back to its real position
      } else {
        await this.#handleError(err);
      }
    }
  }

  async #handleError(err) {
    if (err instanceof ApiError && err.status === 401) {
      await this.#authGate.reset(this.#rootElement);
      await this.init(); // simplistic re-init after re-auth; fine for a first draft
      return;
    }
    console.error(err);
    this.#toast.show(err.message ?? 'Something went wrong.', { type: 'error' });
  }
}
