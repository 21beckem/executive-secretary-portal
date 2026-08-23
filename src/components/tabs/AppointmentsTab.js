import { DateUtils } from '../../utils/DateUtils.js';
import { AvailabilityCalculator } from '../../services/AvailabilityCalculator.js';
import { DragDropController } from '../../services/DragDropController.js';
import { DragCoordinator } from '../../services/DragCoordinator.js';
import { WeekNavigator } from '../WeekNavigator.js';
import { ScheduleView } from '../ScheduleView.js';
import { AppointmentForm } from '../AppointmentForm.js';
import { ApiError } from '../../api/ApiError.js';
import { Tab } from './Tab.js';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal.js';

const PIXELS_PER_MINUTE = 2; // 96px/hour, 24px per 15-minute slot

export class AppointmentsTab extends Tab {
  #appointmentRepository;
  #appointmentTypeRepository;
  #availabilityRepository;
  #authGate;
  #toast;
  #deleteModal;

  #toolbar;
  #weekNavigator;
  #scheduleContainer;
  #scheduleView;
  #dragDropController;
  #dragCoordinator;

  #appointmentTypes = [];
  #appointmentTypesById = new Map();
  #availabilityCalculator = null;

  #currentWeekStart;
  #currentAppointments = [];
  #unscheduledAppointments = [];
  #activeForm = null;
  #initialized = false;

  constructor({ appointmentRepository, appointmentTypeRepository, availabilityRepository, authGate, toast }) {
    super();
    this.#appointmentRepository = appointmentRepository;
    this.#appointmentTypeRepository = appointmentTypeRepository;
    this.#availabilityRepository = availabilityRepository;
    this.#authGate = authGate;
    this.#toast = toast;
    this.#currentWeekStart = DateUtils.getWeekStart(new Date());
    this.#dragDropController = new DragDropController({ pixelsPerMinute: PIXELS_PER_MINUTE });
    this.#dragCoordinator = new DragCoordinator({ dragDropController: this.#dragDropController });
    this.#deleteModal = new ConfirmDeleteModal();
    this.#buildShell();
  }

  /** Called once by TabManager the first time this tab is activated. */
  async init() {
    if (this.#initialized) return;
    this.#initialized = true;

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
        onStatusChange: (id, status) => this.#changeStatus(id, status),
        onShowToast: (message, type) => this.#toast.show(message, { type }),
      });
      this.#scheduleContainer.appendChild(this.#scheduleView.element);

      await this.#loadWeek();
    } catch (err) {
      await this.#handleError(err);
    }
  }

  #buildShell() {
    this.element.className = 'appointments-tab';

    this.#toolbar = document.createElement('div');
    this.#toolbar.className = 'appointments-tab__toolbar';

    this.#weekNavigator = new WeekNavigator({
      weekStart: this.#currentWeekStart,
      onChange: (direction) => this.#changeWeek(direction),
      onSet: (weekStartDate) => this.#setWeek(weekStartDate),
    });
    this.#toolbar.appendChild(this.#weekNavigator.element);

    this.#scheduleContainer = document.createElement('div');
    this.#scheduleContainer.className = 'schedule-container';

    this.element.appendChild(this.#toolbar);
    this.element.appendChild(this.#scheduleContainer);
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
    // Mounted to <body>, not this tab's own element, so it's never at risk
    // of being clipped by some future ancestor with a transform/filter set.
    this.#activeForm.mount(document.body);
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
    if (!(await this.#deleteModal.open('Are you sure you want to delete this appointment?')))
        return;

    try {
      await this.#appointmentRepository.remove(id);
      this.#toast.show('Appointment deleted.', { type: 'success' });
      this.#closeForm();
      await this.#loadWeek();
    } catch (err) {
      await this.#handleError(err);
    }
  }

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
        await this.#loadWeek();
      } else {
        await this.#handleError(err);
      }
    }
  }

  /** Status is edited only by tapping the checkbox on the block itself — never via the form. */
  async #changeStatus(id, status) {
    try {
      await this.#appointmentRepository.update(id, { status });
      await this.#loadWeek();
    } catch (err) {
      await this.#handleError(err);
    }
  }

  async #handleError(err) {
    if (err instanceof ApiError && err.status === 401) {
      await this.#authGate.reset(document.body);
      this.#initialized = false;
      await this.init(); // tab-scoped recovery — no need to rebuild the whole portal shell
      return;
    }
    console.error(err);
    this.#toast.show(err.message ?? 'Something went wrong.', { type: 'error' });
  }
}