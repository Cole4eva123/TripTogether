import assert from "node:assert/strict";
import {test} from "node:test";
import {normalizeState,parseStatePriceTable} from "./regions.ts";
const table='<p>Price as of <span>11/14/26</span></p><table><tr><td><a>Illinois</a></td><td>$4.20</td><td>$4.50</td><td>$4.90</td><td>$5.10</td></tr><tr><td>Kentucky</td><td>$3.50</td><td>$3.80</td><td>$4.10</td><td>$4.90</td></tr></table>';
const now=Date.parse("2026-11-14T18:00:00Z");
test("state averages retain their publication date, source and selected fuel grade",()=>{
  const result=parseStatePriceTable(table,"diesel",now);
  assert.equal(result.length,2);assert.equal(result[0].state,"IL");assert.equal(result[0].average,5.1);
  assert.equal(result[0].observedAt,"2026-11-14T00:00:00.000Z");assert.equal(result[0].kind,"regional report");
  assert.equal(normalizeState("Kentucky"),"KY");assert.equal(normalizeState("US-TN"),"TN");
});
test("a stale, invalid or missing publication date cannot become a current price",()=>{
  assert.deepEqual(parseStatePriceTable(table,"regular",now+8*86400000),[]);
  assert.deepEqual(parseStatePriceTable(table.replace("11/14/26","02/31/26"),"regular",now),[]);
  assert.deepEqual(parseStatePriceTable(table.replace("Price as of","Updated"),"regular",now),[]);
});
