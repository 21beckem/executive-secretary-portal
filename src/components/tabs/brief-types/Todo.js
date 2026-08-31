import { TypeDefinition } from 'https://21beckem.github.io/becker-briefs/BriefsCollection.js';

export class TodoType extends TypeDefinition {
  constructor() { 
    super('todo', 'ToDo', TypeDefinition.PillColors.fromBorderHex('#fcba03'));
  }

  createDefaultData() {
    return { completed: false };
  }

  /**
   * @param {object} data
   */
  validateData(data) {
    if (typeof data !== 'object' || data === null)
      throw new TypeError('data must be a non-null object');
    if (typeof data.completed !== 'boolean')
      throw new TypeError('data.completed must be a boolean');
  }

  getIcon(typeInstance) {
    return '\u2713';
  }

  createInputElement(typeInstance, onDataChange) {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'BRIEFS-todo-checkbox';
    checkbox.checked = Boolean(typeInstance.data.completed);
    checkbox.setAttribute('aria-label', 'Mark complete');
    checkbox.addEventListener('change', () => {
      onDataChange({ completed: checkbox.checked });
    });
    return checkbox;
  }

  createModalContent(typeInstance, onDataChange) {
    const wrapper = document.createElement('div');
    wrapper.className = 'BRIEFS-todo-modal';

    const heading = document.createElement('h3');
    heading.textContent = 'To-do details';
    wrapper.appendChild(heading);

    const label = document.createElement('label');
    label.className = 'BRIEFS-todo-modal__label';
    label.textContent = 'Due date';
    wrapper.appendChild(label);

    // const dateInput = document.createElement('input');
    // dateInput.type = 'date';
    // dateInput.className = 'BRIEFS-todo-modal__date';
    // dateInput.value = typeInstance.data.dueDate ?? '';
    // dateInput.addEventListener('change', () => {
    //   onDataChange({ dueDate: dateInput.value.length > 0 ? dateInput.value : null });
    // });
    // label.appendChild(dateInput);

    return wrapper;
  }

  isStrikethrough(typeInstance) {
    return Boolean(typeInstance.data.completed);
  }
}
