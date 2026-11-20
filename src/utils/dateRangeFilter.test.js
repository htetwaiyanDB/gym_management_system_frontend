import { describe, expect, it } from "vitest";
import { compareDatesDescending, isRecordRangeContainedByFilter } from "./dateRangeFilter";

const date = (value) => new Date(`${value}T00:00:00`);

describe("isRecordRangeContainedByFilter", () => {
  const filterStart = date("2026-10-20");
  const filterEnd = date("2026-11-30");

  it("includes a plan whose full date range is inside the selected range", () => {
    expect(
      isRecordRangeContainedByFilter(
        date("2026-10-20"),
        date("2026-11-30"),
        filterStart,
        filterEnd,
      ),
    ).toBe(true);
  });

  it("excludes a plan that starts before or ends after the selected range", () => {
    expect(
      isRecordRangeContainedByFilter(
        date("2026-10-19"),
        date("2026-11-17"),
        filterStart,
        filterEnd,
      ),
    ).toBe(false);
    expect(
      isRecordRangeContainedByFilter(
        date("2026-10-20"),
        date("2026-12-01"),
        filterStart,
        filterEnd,
      ),
    ).toBe(false);
  });

  it("requires the record date used by each supplied boundary", () => {
    expect(isRecordRangeContainedByFilter(null, date("2026-11-17"), filterStart, filterEnd)).toBe(false);
    expect(isRecordRangeContainedByFilter(date("2026-10-20"), null, filterStart, filterEnd)).toBe(false);
  });
});

describe("compareDatesDescending", () => {
  it("sorts the latest date first and missing dates last", () => {
    const values = [date("2026-11-14"), null, date("2026-11-18"), date("2026-11-16")];
    expect(values.sort(compareDatesDescending)).toEqual([
      date("2026-11-18"),
      date("2026-11-16"),
      date("2026-11-14"),
      null,
    ]);
  });
});
