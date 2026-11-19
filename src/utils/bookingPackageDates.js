export function isMonthBasedPackage(packageOption) {
  return Number(packageOption?.duration_months) > 0;
}

export function getEndDateAfterPackageChange(currentEndDate, nextPackage) {
  return isMonthBasedPackage(nextPackage) ? "" : currentEndDate;
}

export function getBookingDatePayload(startDate, endDate, packageOption) {
  if (isMonthBasedPackage(packageOption)) return { start_date: startDate };
  return { start_date: startDate, end_date: endDate };
}
