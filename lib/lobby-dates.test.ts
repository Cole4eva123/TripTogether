import { test } from "node:test";
import assert from "node:assert/strict";
import { validLobbyDate } from "./lobby-dates.ts";
test("date filters require real ISO dates, including leap years",()=>{
 for(const value of ["2028-02-29","2027-12-31","2027-01-01"])assert.ok(validLobbyDate(value));
 for(const value of ["2027-02-29","2027-02-31","2027-13-01","2027-1-2","invalid",""])assert.equal(validLobbyDate(value),false);
});
