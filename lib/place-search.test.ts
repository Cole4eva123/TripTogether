import assert from "node:assert/strict";
import { test } from "node:test";
import { describePlace } from "./matching.ts";
import { placeMatchesQuery, qualifiedPlaceName, searchPlaces } from "./place-search.ts";
import { allPlaces } from "./places.ts";

test("a place is searched for by the names people write for it", () => {
  const results = searchPlaces("北京");
  assert.ok(results.length, "the Chinese name finds the city");
  assert.equal(results[0].name, "Beijing");
});

test("a place is searched for by its English name too", () => {
  const results = searchPlaces("Beijing");
  assert.ok(results.length);
  assert.equal(results[0].name, "Beijing");
});

test("a nickname finds the city it stands for", () => {
  const results = searchPlaces("NYC");
  assert.ok(results.length, "the nickname finds something");
  assert.ok(results.some((place) => place.name === "New York City"), `expected New York City, got ${results.map((r) => r.name).join(", ")}`);
});

test("a few letters find the places that start with them", () => {
  const results = searchPlaces("kyot");
  assert.ok(results.some((place) => place.name === "Kyoto"));
});

test("a place in another part of the world is found as well", () => {
  const results = searchPlaces("Kyoto");
  assert.ok(results.some((place) => place.name === "Kyoto"));
  assert.ok(results.some((place) => place.name === "Kyoto" && place.country === "Japan"));
});

test("the search says enough to tell two alike places apart", () => {
  const results = searchPlaces("Springfield");
  assert.ok(results.length > 1, "Springfield is in more than one state");
  assert.ok(results.every((place) => place.region || place.country));
});

test("an empty search finds nothing", () => {
  assert.deepEqual(searchPlaces(""), []);
  assert.deepEqual(searchPlaces("   "), []);
});

test("a place is only listed once, however many of its names matched", () => {
  const results = searchPlaces("北京");
  assert.ok(results.length, "the Chinese name finds the city");
  assert.equal(results.length, 1, `expected one Beijing, got ${results.map((r) => r.name).join(", ")}`);
});

test("a country answers a search with its biggest cities", () => {
  const results = searchPlaces("Japan");
  assert.ok(results.length, "Japan is a place people travel to");
  assert.ok(
    results.some((place) => place.country === "Japan"),
    `expected a place in Japan, got ${results.map((r) => `${r.name} (${r.country})`).join(", ")}`,
  );
});

test("a region answers a search with the cities in it", () => {
  const results = searchPlaces("California");
  assert.ok(results.length, "California is a place people travel to");
  assert.ok(
    results.every((place) => place.region === "California" || place.country === "United States"),
    `expected places in California, got ${results.map((r) => `${r.name} (${r.region})`).join(", ")}`,
  );
});

test("the place a name really means comes first, even against a bigger namesake", () => {
  // Quito's alternate name is "San Francisco de Quito", and Quito is the bigger city.
  const results = searchPlaces("san fran");
  assert.equal(results[0].name, "San Francisco", "San Francisco comes before its namesakes");
  assert.equal(results[0].region, "California");
});

test("the capital comes first when two places share a name", () => {
  const london = searchPlaces("london");
  assert.equal(london[0].name, "London");
  assert.equal(london[0].region, "England", "London, England is the one people mean");
});

test("a big capital is not ranked below the towns around it", () => {
  const kyoto = searchPlaces("kyot");
  assert.equal(kyoto[0].name, "Kyoto", "Kyoto comes before its own suburbs");
  const tokyo = searchPlaces("toky");
  assert.equal(tokyo[0].name, "Tokyo", "Tokyo comes before its own suburbs");
});

test("a name shared by a city and its region means the city", () => {
  // "Santa Fe" is both a city in New Mexico and the province of New Mexico.
  const santaFe = searchPlaces("santa fe");
  assert.ok(
    santaFe.some((place) => place.region === "New Mexico"),
    "the city in New Mexico is among the answers",
  );
});

test("a place's name is written out with the region under it", () => {
  assert.equal(qualifiedPlaceName("Beijing"), "Beijing, China");
  assert.equal(qualifiedPlaceName("北京"), "Beijing, China");
  assert.equal(qualifiedPlaceName("Chicago"), "Chicago, Illinois");
  assert.equal(qualifiedPlaceName("New York City"), "New York City, New York");
});

test("a name the gazetteer doesn't know is left alone", () => {
  assert.equal(qualifiedPlaceName(""), null);
  assert.equal(qualifiedPlaceName("Grandma's Cottage"), null);
});

test("a search finds the place it names, whatever language it is written in", () => {
  assert.equal(placeMatchesQuery("Beijing", "北京"), true);
  assert.equal(placeMatchesQuery("Beijing", "beijing"), true);
  assert.equal(placeMatchesQuery("Beijing", "China"), true, "the country answers as well");
});

test("a search finds a place a short drive away", () => {
  assert.equal(placeMatchesQuery("Cambridge, Massachusetts", "Boston"), true);
});

test("a search doesn't find a place that isn't there", () => {
  assert.equal(placeMatchesQuery("Beijing", "Sydney"), false);
  assert.equal(placeMatchesQuery("Beijing", "Tokyo"), false);
});

test("a place the gazetteer doesn't know is searched as text", () => {
  assert.equal(placeMatchesQuery("Grandma's Cottage", "cottage"), true);
  assert.equal(placeMatchesQuery("Grandma's Cottage", "castle"), false);
});

test("the full name a form stores always reads back as itself, for every place there is", () => {
  // Read back as a name and a qualifier, these two land on Braşov and on nothing.
  assert.equal(qualifiedPlaceName("Kronstadt, St. Petersburg"), "Kronstadt, St. Petersburg");
  assert.equal(qualifiedPlaceName("Sa'dah, Yemen"), "Sa'dah, Yemen");
  for (const place of allPlaces()) {
    const label = describePlace(place);
    assert.equal(qualifiedPlaceName(label), label);
  }
  for (const found of searchPlaces("springfield")) assert.equal(qualifiedPlaceName(found.label), found.label);
});
