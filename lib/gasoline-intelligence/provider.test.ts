import test from "node:test";
import assert from "node:assert/strict";
import { fuelDataProvider } from "./provider.ts";

test("existing setups keep the original provider until Google is configured", () => {
  assert.equal(fuelDataProvider({}), "openstreetmap");
  assert.equal(fuelDataProvider({ FUEL_DATA_PROVIDER: "openstreetmap", GOOGLE_MAPS_API_KEY: "server" }), "openstreetmap");
});

test("Google requires both keys before making paid requests", () => {
  assert.throws(() => fuelDataProvider({ FUEL_DATA_PROVIDER: "google" }), /GOOGLE_MAPS_API_KEY/);
  assert.throws(() => fuelDataProvider({ GOOGLE_MAPS_API_KEY: "server" }), /NEXT_PUBLIC_GOOGLE_MAPS_API_KEY/);
  assert.equal(fuelDataProvider({ GOOGLE_MAPS_API_KEY: "server", NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "browser" }), "google");
  assert.throws(() => fuelDataProvider({ FUEL_DATA_PROVIDER: "typo" }), /FUEL_DATA_PROVIDER/);
});
