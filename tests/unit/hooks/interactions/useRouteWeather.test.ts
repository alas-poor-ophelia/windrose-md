/**
 * useRouteWeather Unit Tests
 *
 * The departure window's day in effect: the window starts at the view day,
 * so the default departure is always listed; a choice outside the window
 * (stale after the view day moved) falls back to the view day.
 */

import { describe, it, expect } from "vitest";

import { DEPARTURE_WINDOW_DAYS, resolveDepartureDay } from "../../../../src/hooks/interactions/useRouteWeather";

describe("resolveDepartureDay", () => {
  it("defaults to the view day", () => {
    expect(resolveDepartureDay(null, 12)).toBe(12);
  });

  it("keeps a choice inside the window", () => {
    expect(resolveDepartureDay(14, 12)).toBe(14);
    expect(resolveDepartureDay(12 + DEPARTURE_WINDOW_DAYS - 1, 12)).toBe(12 + DEPARTURE_WINDOW_DAYS - 1);
  });

  it("clamps a stale choice back to the view day", () => {
    expect(resolveDepartureDay(11, 12)).toBe(12);
    expect(resolveDepartureDay(12 + DEPARTURE_WINDOW_DAYS, 12)).toBe(12);
  });

  it("has no departure without a view day", () => {
    expect(resolveDepartureDay(14, null)).toBeNull();
  });
});
