import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFuelPlan, distanceMiles, eligibleStations, projectOnRoute, regionalPrices, selectStops, stationPrice } from "./gasoline-intelligence.ts";
import { parseFuelPreferences } from "./fuel-validation.ts";
import type { FuelPreferences, FuelSearch, RoadRoute, Station } from "./fuel-types.ts";

const input:FuelPreferences={origin:"A",destination:"B",departure:"2026-11-20T12:00:00Z",vehicle:{year:2022,make:"Toyota",model:"RAV4",trim:"XLE",mpg:30,tankGallons:14,grade:"regular"},initialFuelPercent:100,reservePercent:15,intervalMinutes:60,maxDetourMinutes:20,stopMinutes:15,amenities:["Restroom"],memberships:[],estimatedPrice:3.5,timeValue:15,otherCosts:25};
function route(distances:number[],minutes=distances):RoadRoute {
  const miles=distances.reduce((a,b)=>a+b,0),time=minutes.reduce((a,b)=>a+b,0);
  return {origin:{lat:40,lng:-90},destination:{lat:40,lng:-80},points:[{lat:40,lng:-90,miles:0,minutes:0},{lat:40,lng:-80,miles,minutes:time}],miles,minutes:time,legs:distances.map((m,i)=>({miles:m,minutes:minutes[i]}))};
}
function station(id:string,miles:number,price=3.5):Station {
  return {id,name:id,brand:id,address:"1 Main St",state:"IL",location:{lat:40,lng:-90+miles/60},routeMiles:miles,routeMinutes:miles,detourMiles:0,detourMinutes:0,amenities:["Restroom"],membersOnly:false,price:{perGallon:price,source:{title:"test",url:"https://example.com/price"},observedAt:"2026-11-14T12:00:00Z"},open:"24/7",mapUrl:"https://www.openstreetmap.org"};
}
function search(miles:number,stations:Station[]):FuelSearch {
  return {id:"test",expiresAt:"2026-11-30T00:00:00Z",route:route([miles]),stations,regions:[],warnings:[],searchedAt:"2026-11-14T00:00:00Z"};
}
test("projects a station onto a road segment rather than its nearest vertex",()=>{
  const projected=projectOnRoute({lat:40,lng:-85},route([600]));
  assert.ok(Math.abs(projected.miles-300)<0.001);assert.equal(projected.offRoute,0);
  assert.ok(distanceMiles({lat:40,lng:-90},{lat:40,lng:-89})>50);
});
test("membership-only fuel is excluded unless the matching membership is present",()=>{
  const s={...station("Costco",60),membersOnly:true};
  assert.equal(eligibleStations(search(120,[s]),input).length,0);
  assert.equal(eligibleStations(search(120,[s]),{...input,memberships:[{brand:"Costco",discountCents:0}]}).length,1);
});
test("applies only the member's specified discount and labels unknown station prices as estimates",()=>{
  const s=station("Shell",60,3.5);
  assert.equal(stationPrice(s,{...input,memberships:[{brand:"Shell",discountCents:10}]},[])?.value,3.4);
  assert.equal(stationPrice({...s,price:null},input,[])?.kind,"user estimate");
  assert.equal(stationPrice({...s,price:null},{...input,estimatedPrice:null},[]),null);
});
test("hourly mode spreads recommendations across a long route",()=>{
  const stations=[60,120,180,240,300].map(m=>station(`s${m}`,m));
  const selected=selectStops(search(360,stations),input);
  assert.ok(selected.length>=3);
  const times=[0,...selected.map(s=>s.routeMinutes),360];
  assert.ok(times.slice(1).every((n,i)=>n-times[i]<=180));
});
test("low starting fuel forces an earlier reachable stop",()=>{
  const selected=selectStops(search(240,[station("early",30),station("later",120)]),{...input,initialFuelPercent:25});
  assert.equal(selected[0].id,"early");
});
test("unreachable gaps fail instead of returning an unsafe itinerary",()=>{
  assert.throws(()=>selectStops(search(600,[station("too-far",400)]),input),/No safe combination/);
  assert.throws(()=>selectStops(search(100,[]),{...input,initialFuelPercent:10}),/below your reserve/);
});
test("buys only enough at the expensive stop to reach cheaper fuel with reserve",()=>{
  const stations=[station("expensive",60,4.5),station("cheap",180,3)];
  const plan=buildFuelPlan(search(300,stations),{...input,initialFuelPercent:35},stations,route([60,120,120]));
  assert.ok(Math.abs(plan.stops[0].buyGallons-3.2)<0.00001);
  assert.ok(Math.abs(plan.fuelOnArrival-2.1)<0.00001);
  assert.ok(plan.stops.every(s=>s.fuelAfterStop<=14));
});
test("rest stops may buy zero gallons when existing fuel is sufficient",()=>{
  const s=station("rest",60);
  const plan=buildFuelPlan(search(120,[s]),input,[s],route([60,60]));
  assert.equal(plan.stops[0].buyGallons,0);assert.equal(plan.purchaseCost,0);
  assert.equal(plan.fuelConsumedCost,14);assert.equal(plan.totalCost,39);
});
test("actual road distances can reject a candidate that looked reachable on the base route",()=>{
  const s=station("s",60);
  assert.throws(()=>buildFuelPlan(search(120,[s]),{...input,initialFuelPercent:25},[s],route([90,30])),/cannot be reached/);
});
test("manual edits cannot exceed three hours between breaks",()=>{
  assert.throws(()=>buildFuelPlan(search(240,[]),input,[],route([240])),/over three hours/);
});
test("arrival times include all previous breaks and fuel quantities conserve gallons",()=>{
  const stations=[station("one",120),station("two",240)];
  const p=buildFuelPlan(search(360,stations),input,stations,route([120,120,120]));
  assert.equal(p.totalMinutes,390);
  assert.equal(p.stops[1].arrival,"2026-11-20T16:15:00.000Z");
  assert.ok(Math.abs(14+p.gallonsPurchased-p.gallonsUsed-p.fuelOnArrival)<0.00001);
});
test("regional samples expose sample size and price changes without pretending to be statewide data",()=>{
  const stations=[station("a",60,4),station("b",120,3.8),{...station("c",180,3.1),state:"IN"}];
  const regions=regionalPrices(stations);
  assert.equal(regions[0].average,3.9);assert.equal(regions[0].count,2);
  assert.equal(regions[0].kind,"station sample");assert.ok(Math.abs(regions[1].change!+0.8)<0.00001);
});
test("server requires vehicle confirmation and rejects nonfinite or excessive parameters",()=>{
  assert.throws(()=>parseFuelPreferences(input),/Confirm your vehicle/);
  assert.equal(parseFuelPreferences({...input,vehicleConfirmed:true}).vehicle.make,"Toyota");
  for(const bad of [{intervalMinutes:200},{estimatedPrice:NaN},{reservePercent:0},{vehicle:{...input.vehicle,mpg:0}}]) {
    assert.throws(()=>parseFuelPreferences({...input,vehicleConfirmed:true,...bad}));
  }
});
test("departure preserves the trip's calendar day and validates real dates",()=>{
  const body={...input,vehicleConfirmed:true};
  assert.equal(parseFuelPreferences({...body,departure:"2026-11-27"}).departure,"2026-11-27");
  assert.equal(parseFuelPreferences({...body,departure:"2024-02-29"}).departure,"2024-02-29");
  assert.equal(parseFuelPreferences(body).departure,input.departure);
  for(const departure of ["2026-02-29","2026-02-31","2026-13-01",""]) {
    assert.throws(()=>parseFuelPreferences({...body,departure}),/Departure date|departure date/);
  }
});
