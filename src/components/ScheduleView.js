import { DateUtils } from '../utils/DateUtils.js';
import { DayColumn } from './DayColumn.js';
import { UnscheduledColumn } from './UnscheduledColumn.js';

export class ScheduleView {
  #availabilityCalculator;
  #dragDropController;
  #dragCoordinator;
  #onSlotClick;
  #onAppointmentMove;
  #onAppointmentEdit;
  #onAddUnscheduled;
  #onStatusChange;
  #element;
  #columnsContainer;
  #onShowToast;

  constructor({
    availabilityCalculator,
    dragDropController,
    dragCoordinator,
    onSlotClick,
    onAppointmentMove,
    onAppointmentEdit,
    onAddUnscheduled,
    onStatusChange,
    onShowToast,
  }) {
    this.#availabilityCalculator = availabilityCalculator;
    this.#dragDropController = dragDropController;
    this.#dragCoordinator = dragCoordinator;
    this.#onSlotClick = onSlotClick;
    this.#onAppointmentMove = onAppointmentMove;
    this.#onAppointmentEdit = onAppointmentEdit;
    this.#onAddUnscheduled = onAddUnscheduled;
    this.#onStatusChange = onStatusChange;
    this.#onShowToast = onShowToast;
    this.#element = this.#buildElement();
  }

  get element() {
    return this.#element;
  }

  #buildElement() {
    const wrapper = document.createElement('div');
    wrapper.className = 'schedule-view';
    this.#columnsContainer = document.createElement('div');
    this.#columnsContainer.className = 'day-columns';
    wrapper.appendChild(this.#columnsContainer);
    return wrapper;
  }

  render({ weekStart, appointments, unscheduledAppointments, appointmentTypesById }) {
    // Columns are rebuilt from scratch on every render, so previously
    // registered drop zones would otherwise point at detached DOM nodes.
    this.#dragCoordinator.reset();

    const visibleDays = this.#availabilityCalculator.getVisibleDaysForWeek(weekStart, appointments);
    this.#columnsContainer.innerHTML = '';

    if (visibleDays.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'schedule-view__empty';
      empty.textContent = 'No availability windows configured and no appointments this week.';
      this.#columnsContainer.appendChild(empty);
    } else {
      const today = new Date();
      for (const day of visibleDays) {
        const { startMinutes, endMinutes } = this.#availabilityCalculator.getTimeBoundsForDay(day);
        const column = new DayColumn({
          date: day.date,
          iso: day.iso,
          windows: day.windows,
          appointments: day.appointments,
          appointmentTypesById,
          availabilityCalculator: this.#availabilityCalculator,
          gridStartMinutes: startMinutes,
          gridEndMinutes: endMinutes,
          dragDropController: this.#dragDropController,
          dragCoordinator: this.#dragCoordinator,
          isRegularDay: day.isRegularDay,
          isToday: DateUtils.isSameDate(day.date, today),
          onSlotClick: this.#onSlotClick,
          onAppointmentMove: this.#onAppointmentMove,
          onAppointmentEdit: this.#onAppointmentEdit,
          onStatusChange: this.#onStatusChange,
          onShowToast: this.#onShowToast,
        });
        this.#columnsContainer.appendChild(column.element);
      }
    }

    const unscheduledColumn = new UnscheduledColumn({
      appointments: unscheduledAppointments,
      appointmentTypesById,
      dragDropController: this.#dragDropController,
      dragCoordinator: this.#dragCoordinator,
      onAdd: this.#onAddUnscheduled,
      onAppointmentMove: this.#onAppointmentMove,
      onAppointmentEdit: this.#onAppointmentEdit,
      onStatusChange: this.#onStatusChange,
    });
    this.#columnsContainer.appendChild(unscheduledColumn.element);
  }
}
