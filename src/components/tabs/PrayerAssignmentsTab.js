import { Tab } from './Tab.js';
import { ApiError } from '../../api/ApiError.js';
import { escapeHtml, getDayWithOrdinal } from '../../utils/helpers.js';
import { PrayerAssignmentRepository } from '../../repositories/PrayerAssignmentRepository.js';
import { ConfirmDeleteModal } from '../ConfirmDeleteModal.js';

export class PrayerAssignmentsTab extends Tab {
    #context;
    #repository;
    #assignments = []; // real records only, sorted desc by date
    #searchQuery = '';
    #loaded = false;

    #searchInput;
    #tableBody;
    #deleteModal;

    constructor(context) {
        super();
        this.#context = context;
        this.#repository = new PrayerAssignmentRepository(context.apiClient);
        this.#deleteModal = new ConfirmDeleteModal();
        this.#buildDom();
    }

    #buildDom() {
        this.element.className = 'prayer-assignments-tab';
        this.element.innerHTML = `
      <div class="prayer-assignments-tab__search">
        <input
          type="text"
          class="prayer-assignments-tab__search-input"
          placeholder="Search by name..."
        />
      </div>
      <div class="prayer-assignments-tab__table-wrap">
        <table class="prayer-assignments-tab__table">
          <thead>
            <tr>
              <th>Date</th>
              <th style="padding-left: 0; padding-right: 0; text-align: center;">&check;</th>
              <th>Opening Prayer</th>
              <!-- <th style="padding-left: 0; padding-right: 0; text-align: center;">&check;</th> -->
              <th>Closing Prayer</th>
              <th></th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

        this.#tableBody = this.element.querySelector('tbody');
        this.#searchInput = this.element.querySelector('.prayer-assignments-tab__search-input');
        this.#searchInput.addEventListener('input', () => {
            this.#searchQuery = this.#searchInput.value.trim().toLowerCase();
            this.#render();
        });
    }

    async init() {
        await this.#loadAssignments();
    }

    // ---- data loading -------------------------------------------------

    async #loadAssignments() {
        try {
            this.#assignments = await this.#repository.getAll();
            this.#sortAssignments();
            this.#loaded = true;
            this.#render();
        } catch (err) {
            await this.#handleError(err, () => this.#loadAssignments());
        }
    }

    #sortAssignments() {
        this.#assignments.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    }

    async #handleError(err, retry) {
        if (err instanceof ApiError && err.status === 401) {
            await this.#context.authGate.reset(document.body);
            if (retry) await retry();
            return;
        }
        this.#context.toast.show(err.message ?? 'Something went wrong.', { type: 'error' });
    }

    // ---- date math for the synthetic blank row -------------------------

    #toIsoDate(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    #addDays(isoDate, days) {
        const [y, m, d] = isoDate.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        date.setDate(date.getDate() + days);
        return this.#toIsoDate(date);
    }

    #nextSundayOnOrAfter(isoDate) {
        const [y, m, d] = isoDate.split('-').map(Number);
        const date = new Date(y, m - 1, d);
        const day = date.getDay(); // 0 = Sunday
        if (day !== 0) date.setDate(date.getDate() + (7 - day));
        return this.#toIsoDate(date);
    }

    #computeNextBlankDate() {
        const latest = this.#assignments[0]?.date;
        const base = latest ? this.#addDays(latest, 1) : this.#toIsoDate(new Date());
        return this.#nextSundayOnOrAfter(base);
    }

    // ---- filtering / rendering ------------------------------------------

    #filteredAssignments() {
        const output = [];
        let currentMonth = null;
        for (let i = 0; i < this.#assignments.length; i++) {
            const a = this.#assignments[i];

            // Insert month headers
            let thisMonth = new Date(a.date).getMonth();
            if (i === 0) {
                output.push(
                    new Date(a.date)
                        .toLocaleString('en-US', { 
                            month: 'long', 
                            year: 'numeric'
                        })
                );
            } else {
                if (thisMonth !== currentMonth) {
                    output.push(
                        new Date(a.date)
                            .toLocaleString('en-US', { 
                                month: 'long', 
                                year: 'numeric'
                            })
                    );
                }
            }
            currentMonth = thisMonth;
            
            // Filter by search query
            const opening = (a.openingPrayerName ?? '').toLowerCase();
            const closing = (a.closingPrayerName ?? '').toLowerCase();
            if (opening.includes(this.#searchQuery) || closing.includes(this.#searchQuery)) {
                output.push(a);
            }
        }
        return output;
    }

    #render() {
        if (!this.#loaded) {
            this.#tableBody.innerHTML = `
        <tr><td colspan="6" class="prayer-assignments-tab__loading">Loading…</td></tr>
      `;
            return;
        }

        this.#tableBody.innerHTML = '';
        this.#tableBody.appendChild(this.#buildBlankRow());
        for (const assignment of this.#filteredAssignments()) {
            this.#tableBody.appendChild(this.#buildRow(assignment));
        }
    }

    #buildBlankRow() {
        const date = this.#computeNextBlankDate();
        const tr = document.createElement('tr');
        tr.className = 'prayer-assignments-tab__row prayer-assignments-tab__row--blank';
        tr.innerHTML = `
      <td class="prayer-assignments-tab__date-cell">
        <div class="prayer-assignments-tab__date-display">${getDayWithOrdinal(new Date(date))}</div>
        <input type="date" class="prayer-assignments-tab__date-input" value="${escapeHtml(date)}" />
      </td>
      <td class="prayer-assignments-tab__checkbox-cell">
        <input type="checkbox" data-field="opening_confirmed" />
      </td>
      <td>
        <input type="text" class="prayer-assignments-tab__name-input" data-field="opening_prayer_name" placeholder="Name" />
      </td>
      <!-- <td class="prayer-assignments-tab__checkbox-cell">
        <input type="checkbox" data-field="closing_confirmed" />
      </td> -->
      <td>
        <input type="text" class="prayer-assignments-tab__name-input" data-field="closing_prayer_name" placeholder="Name" />
      </td>
      <td></td>
    `;

        const dateDisplay = tr.querySelector('.prayer-assignments-tab__date-display');
        const dateInput = tr.querySelector('.prayer-assignments-tab__date-input');
        const openingConfirmed = tr.querySelector('[data-field="opening_confirmed"]');
        // const closingConfirmed = tr.querySelector('[data-field="closing_confirmed"]');
        const openingName = tr.querySelector('[data-field="opening_prayer_name"]');
        const closingName = tr.querySelector('[data-field="closing_prayer_name"]');

        const createFrom = (fieldOverrides) => {
            dateDisplay.textContent = getDayWithOrdinal(new Date(dateInput.value));
            this.#createFromBlankRow({ date: dateInput.value, ...fieldOverrides });
        };

        dateDisplay.addEventListener('click', () => {
            dateInput.showPicker();
        });
        dateInput.addEventListener('change', () => createFrom({}));
        openingName.addEventListener('blur', () => {
            if (openingName.value.trim()) createFrom({ opening_prayer_name: openingName.value.trim() });
        });
        closingName.addEventListener('blur', () => {
            if (closingName.value.trim()) createFrom({ closing_prayer_name: closingName.value.trim() });
        });
        openingConfirmed.addEventListener('change', () => createFrom({ opening_confirmed: openingConfirmed.checked }));
        // closingConfirmed.addEventListener('change', () => createFrom({ closing_confirmed: closingConfirmed.checked }));

        return tr;
    }

    async #createFromBlankRow(fields) {
        if (!fields.date) {
            this.#context.toast.show('Date is required.', { type: 'error' });
            this.#render();
            return;
        }
        try {
            const created = await this.#repository.create(fields);
            this.#assignments.unshift(created);
            this.#sortAssignments();
            this.#render();
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                this.#context.toast.show('A record for that date already exists.', { type: 'error' });
                this.#render();
                return;
            }
            await this.#handleError(err);
            this.#render();
        }
    }

    #buildRow(assignment) {
        const tr = document.createElement('tr');
        tr.className = 'prayer-assignments-tab__row';
        if (typeof assignment === 'string') {
            tr.classList.add('prayer-assignments-tab__row--month-header');
            tr.innerHTML = `<td colspan="6">${escapeHtml(assignment)}</td>`;
            return tr;
        }

        tr.innerHTML = `
      <td class="prayer-assignments-tab__date-cell">
        <div class="prayer-assignments-tab__date-display">${getDayWithOrdinal(new Date(assignment.date))}</div>
        <input type="date" class="prayer-assignments-tab__date-input" value="${escapeHtml(assignment.date)}" />
      </td>
      <td class="prayer-assignments-tab__checkbox-cell">
        <input type="checkbox" data-field="opening_confirmed" ${assignment.openingConfirmed ? 'checked' : ''} />
      </td>
      <td>
        <input type="text" class="prayer-assignments-tab__name-input" data-field="opening_prayer_name"
          value="${escapeHtml(assignment.openingPrayerName ?? '')}" placeholder="Name" />
      </td>
      <!-- <td class="prayer-assignments-tab__checkbox-cell">
        <input type="checkbox" data-field="closing_confirmed" ${assignment.closingConfirmed ? 'checked' : ''} />
      </td> -->
      <td>
        <input type="text" class="prayer-assignments-tab__name-input" data-field="closing_prayer_name"
          value="${escapeHtml(assignment.closingPrayerName ?? '')}" placeholder="Name" />
      </td>
      <td>
        <button type="button" class="btn btn--icon btn--danger prayer-assignments-tab__delete-btn" aria-label="Delete record">&#128465;</button>
      </td>
    `;

        const dateDisplay = tr.querySelector('.prayer-assignments-tab__date-display');
        const dateInput = tr.querySelector('.prayer-assignments-tab__date-input');
        const openingConfirmed = tr.querySelector('[data-field="opening_confirmed"]');
        // const closingConfirmed = tr.querySelector('[data-field="closing_confirmed"]');
        const openingName = tr.querySelector('[data-field="opening_prayer_name"]');
        const closingName = tr.querySelector('[data-field="closing_prayer_name"]');
        const deleteBtn = tr.querySelector('.prayer-assignments-tab__delete-btn');

        let previousDate = assignment.date;
        dateDisplay.addEventListener('click', () => {
            dateInput.showPicker();
        });
        dateInput.addEventListener('change', async () => {
            const newDate = dateInput.value;
            dateDisplay.textContent = getDayWithOrdinal(new Date(newDate));
            if (!newDate) {
                dateInput.value = previousDate;
                return;
            }
            const ok = await this.#patchAssignment(assignment.id, { date: newDate }, () => {
                dateInput.value = previousDate;
            });
            if (ok) previousDate = newDate;
        });

        openingName.addEventListener('blur', () => {
            this.#patchAssignment(assignment.id, { opening_prayer_name: openingName.value.trim() || null });
        });
        closingName.addEventListener('blur', () => {
            this.#patchAssignment(assignment.id, { closing_prayer_name: closingName.value.trim() || null });
        });
        openingConfirmed.addEventListener('change', () => {
            this.#patchAssignment(assignment.id, { opening_confirmed: openingConfirmed.checked });
        });
        // closingConfirmed.addEventListener('change', () => {
        //     this.#patchAssignment(assignment.id, { closing_confirmed: closingConfirmed.checked });
        // });

        deleteBtn.addEventListener('click', async () => {
            if (await this.#deleteModal.open(this.#formatDeleteLabel(assignment)))
                this.#handleDelete(assignment.id);
        });

        return tr;
    }

    #formatDeleteLabel(assignment) {
        const parts = [assignment.date];
        if (assignment.openingPrayerName) parts.push(`Opening: ${assignment.openingPrayerName}`);
        if (assignment.closingPrayerName) parts.push(`Closing: ${assignment.closingPrayerName}`);
        return parts.join(' — ');
    }

    async #patchAssignment(id, fields, onConflict) {
        try {
            const updated = await this.#repository.update(id, fields);
            const idx = this.#assignments.findIndex((a) => a.id === id);
            if (idx !== -1) this.#assignments[idx] = updated;
            this.#sortAssignments();
            this.#render();
            return true;
        } catch (err) {
            if (err instanceof ApiError && err.status === 409) {
                this.#context.toast.show('A record for that date already exists.', { type: 'error' });
                if (onConflict) onConflict();
                return false;
            }
            await this.#handleError(err);
            this.#render();
            return false;
        }
    }

    async #handleDelete(id) {
        try {
            await this.#repository.delete(id);
            this.#assignments = this.#assignments.filter((a) => a.id !== id);
            this.#render();
            this.#context.toast.show('Record deleted.', { type: 'success' });
        } catch (err) {
            await this.#handleError(err);
        }
    }
}