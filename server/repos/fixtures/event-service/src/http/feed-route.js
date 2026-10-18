import { readFeed } from '../services/feed.js';
import { errorResponse } from './errors.js';
import { feedResponse } from './response.js';

export function getFeed(store, request) {
  if (!request.auth?.tenant) return { status: 401, body: { error: 'Authentication required' } };
  try { return feedResponse(readFeed(store, { ...request.query, tenant: request.auth.tenant })); }
  catch (error) { return errorResponse(error); }
}
