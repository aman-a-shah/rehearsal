import { compareEvents } from '../domain/order.js';

export function ordered(items) {
  return [...items].sort(compareEvents);
}
