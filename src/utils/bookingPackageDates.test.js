import { describe, expect, it } from "vitest";
import {
  getBookingDatePayload,
  getEndDateAfterPackageChange,
  isMonthBasedPackage,
} from "./bookingPackageDates";

describe("booking package date rules", () => {
  it("recognizes packages with a positive duration_months as month-based", () => {
    expect(isMonthBasedPackage({ duration_months: 1 })).toBe(true);
    expect(isMonthBasedPackage({ duration_months: "3" })).toBe(true);
    expect(isMonthBasedPackage({ duration_months: 0, sessions_count: 10 })).toBe(false);
  });

  it("omits end_date from month-based booking payloads", () => {
    expect(getBookingDatePayload("2026-11-19", "2026-12-19", { duration_months: 1 }))
      .toEqual({ start_date: "2026-11-19" });
  });

  it("keeps end_date in session-based booking payloads", () => {
    expect(getBookingDatePayload("2026-11-19", "2026-12-19", { duration_months: 0 }))
      .toEqual({ start_date: "2026-11-19", end_date: "2026-12-19" });
  });

  it("clears an existing end date only when switching to a month-based package", () => {
    expect(getEndDateAfterPackageChange("2026-12-19", { duration_months: 1 })).toBe("");
    expect(getEndDateAfterPackageChange("2026-12-19", { sessions_count: 10 }))
      .toBe("2026-12-19");
  });
});
