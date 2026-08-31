

export function formatDateFinnish(date: Date): string {
  // UTC components: dates are resolved against UTC, so reading them here
  // matches the date shown for the (previously string) YYYY-MM-DD form.
  return `${date.getUTCDate()}.${date.getUTCMonth() + 1}.${date.getUTCFullYear()}`;
}
