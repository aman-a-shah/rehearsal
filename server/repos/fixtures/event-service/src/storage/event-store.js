import { event } from '../domain/event.js';

export class EventStore {
  #events = [];
  constructor(items = []) { items.forEach(item => this.append(item)); }
  append(input) {
    const item = event(input);
    if (this.#events.some(saved => saved.tenant === item.tenant && saved.id === item.id)) throw new Error('Duplicate event');
    this.#events.push(item);
    return item;
  }
  forTenant(tenant) { return this.#events.filter(item => item.tenant === tenant); }
  get size() { return this.#events.length; }
}
