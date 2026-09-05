

const MONTHS_FULL = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatDate(date: Date): string {
  // UTC components: dates are resolved against UTC, so reading them here
  // matches the date shown for the (previously string) YYYY-MM-DD form.
  // e.g. "13 April 2026"
  return `${date.getUTCDate()} ${MONTHS_FULL[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateShort(date: Date): string {
  // UTC components, matching formatDate above.
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}.`;
}

