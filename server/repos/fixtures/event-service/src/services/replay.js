import { exportEvents } from './export.js';

export function replayBalances(store, tenant, limit = 25) {
  return exportEvents(store, { tenant, kind: 'credit', limit }).reduce((balance, item) => balance + item.amount, 0);
}
