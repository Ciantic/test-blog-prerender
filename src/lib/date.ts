

export function formatDate(date: Date): string {
  // UTC components: dates are resolved against UTC, so reading them here
  // matches the date shown for the (previously string) YYYY-MM-DD form.
  return `${date.getUTCDate()}.${date.getUTCMonth() + 1}.${date.getUTCFullYear()}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDateShort(date: Date): string {
  // UTC components, matching formatDate above.
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}.`;
}