export function isRecordRangeContainedByFilter(
  recordStartDate,
  recordEndDate,
  filterStartDate,
  filterEndDate,
) {
  if (filterStartDate && (!recordStartDate || recordStartDate < filterStartDate)) return false;
  if (filterEndDate && (!recordEndDate || recordEndDate > filterEndDate)) return false;
  return true;
}

export function compareDatesDescending(left, right) {
  return (right?.getTime?.() ?? 0) - (left?.getTime?.() ?? 0);
}
