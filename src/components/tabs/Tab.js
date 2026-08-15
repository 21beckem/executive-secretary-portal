export class Tab {
    #element;
    constructor() {
        this.#element = document.createElement('div');
    }
    get element() { return this.#element; }
    async init() {}  // optional
    onShow() {}   // optional — called every time it's re-activated
    onHide() {}   // optional — called every time it's deactivated
}