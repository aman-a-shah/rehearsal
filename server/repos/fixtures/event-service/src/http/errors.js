export function errorResponse(error) {
  return { status: error instanceof TypeError || error instanceof RangeError ? 400 : 500, body: { error: error.message } };
}
