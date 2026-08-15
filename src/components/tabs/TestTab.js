import { Tab } from './Tab.js';

export class TestTab extends Tab {
  constructor() {
    super();
    this.element.className = 'test-tab';
    this.element.innerHTML = `
      <h2>Test Tab</h2>
      <p>This is a test tab for demonstration purposes.</p>
    `;
  }
}