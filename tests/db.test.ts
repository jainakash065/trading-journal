import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { initializeDatabase } from "../server/src/db";
import { countMarketHolidaysForYear, deleteMarketHoliday, listMarketHolidays, upsertMarketHoliday } from "../server/src/repository";

describe("database seed data", () => {
  it("seeds 2026 India market holidays idempotently", () => {
    const db: Database.Database = new Database(":memory:");
    initializeDatabase(db);
    initializeDatabase(db);

    const holidays = listMarketHolidays(db, 2026);

    expect(holidays).toHaveLength(16);
    expect(holidays.find((holiday) => holiday.date === "2026-05-01")?.name).toBe("Maharashtra Day");
  });

  it("adds and deletes custom market holidays", () => {
    const db: Database.Database = new Database(":memory:");
    initializeDatabase(db);

    const holiday = upsertMarketHoliday(db, { date: "2027-01-26", name: "Republic Day" });

    expect(countMarketHolidaysForYear(db, 2027)).toBe(1);
    expect(listMarketHolidays(db, 2027)[0]).toMatchObject({ date: "2027-01-26", name: "Republic Day" });
    deleteMarketHoliday(db, holiday.id);
    expect(countMarketHolidaysForYear(db, 2027)).toBe(0);
  });
});
