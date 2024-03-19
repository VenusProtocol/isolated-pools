export function getDescription(isTimeBased: boolean) {
  if (!isTimeBased) {
    return "";
  }
  return "TimeBased ";
}
