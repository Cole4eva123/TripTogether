import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFuelPreferences, createFuelFormSettings, vehicleToFields } from "./form.ts";
import { parseFuelPreferences } from "./validation.ts";

const vehicle = { year: 2010, make: "Toyota", model: "Corolla", trim: "LE", mpg: 34, tankGallons: 13.2, grade: "regular" as const };

test("hidden preference controls preserve the previous valid defaults and calendar date", () => {
  const settings = createFuelFormSettings({ origin: "Tahlequah, OK", destination: "Urbana, IL", startDate: "2026-11-20" });
  const input = parseFuelPreferences(buildFuelPreferences(settings, vehicleToFields(vehicle)));
  assert.equal(input.departure, "2026-11-20");
  assert.equal(input.stopMinutes, 15);
  assert.equal(input.estimatedPrice, 3.5);
  assert.equal(input.requireStationPrices, true);
  assert.ok(!("timeValue" in input));
  assert.ok(!("otherCosts" in input));
  assert.deepEqual(input.amenities, ["Restroom"]);
  assert.deepEqual(input.memberships, []);
});

test("restored optional preferences still support custom facilities, discounts and excluding unknown prices", () => {
  const settings = { ...createFuelFormSettings({ origin: "A", destination: "B" }), customAmenity: "McDonald's", estimatedPrice: "" };
  const input = parseFuelPreferences(buildFuelPreferences(settings, vehicleToFields(vehicle), ["Restroom"], { Shell: "10" }));
  assert.deepEqual(input.amenities, ["Restroom", "McDonald's"]);
  assert.deepEqual(input.memberships, [{ brand: "Shell", discountCents: 10 }]);
  assert.equal(input.estimatedPrice, null);
  assert.equal(vehicleToFields({ make: "Toyota" }).mpg, "");
  assert.equal(vehicleToFields({ make: "Toyota" }).tankGallons, "");
});
