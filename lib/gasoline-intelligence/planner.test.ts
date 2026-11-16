import assert from "node:assert/strict";
import { test } from "node:test";
import { buildFuelPlan, cheapestStops, distanceMiles, eligibleStations, projectOnRoute, regionalPrices, stationPrice, worstLegRatio } from "./planner.ts";
import { parseFuelPreferences } from "./validation.ts";
import type { FuelPreferences, FuelSearch, RoadRoute, Station } from "./types.ts";

const input:FuelPreferences={origin:"A",destination:"B",departure:"2026-11-20T12:00:00Z",vehicle:{year:2022,make:"Toyota",model:"RAV4",trim:"XLE",mpg:30,tankGallons:14,grade:"regular"},initialFuelPercent:100,reservePercent:15,stopMinutes:15,amenities:["Restroom"],memberships:[],estimatedPrice:3.5,requireStationPrices:false};
function route(distances:number[],minutes=distances):RoadRoute {
  const miles=distances.reduce((a,b)=>a+b,0),time=minutes.reduce((a,b)=>a+b,0);
  const end={lat:40,lng:-90+miles/60}; // the same scale as station(), so straight lines never exceed route miles
  return {origin:{lat:40,lng:-90},destination:end,points:[{lat:40,lng:-90,miles:0,minutes:0},{...end,miles,minutes:time}],miles,minutes:time,legs:distances.map((m,i)=>({miles:m,minutes:minutes[i]}))};
}
function station(id:string,miles:number,price=3.5):Station {
  return {id,name:id,brand:id,address:"1 Main St",state:"IL",location:{lat:40,lng:-90+miles/60},routeMiles:miles,routeMinutes:miles,detourMiles:0,detourMinutes:0,amenities:["Restroom"],membersOnly:false,price:{perGallon:price,source:{title:"test",url:"https://example.com/price"},observedAt:new Date().toISOString()},open:"24/7",mapUrl:"https://www.openstreetmap.org"};
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
const ids=(stations:Station[])=>stations.map(s=>s.id);
// The pump cost of a plan through `stations`, bought the way buildFuelPlan buys, on the base route's distances.
function cost(miles:number,stations:Station[],settings:FuelPreferences) {
  const legs=[...stations.map(s=>s.routeMiles),miles].map((m,i,all)=>m-(i?all[i-1]:0));
  return buildFuelPlan(search(miles,stations),settings,stations,route(legs)).purchaseCost;
}
test("a trip the tank already covers needs no stop, however cheap the stations are",()=>{
  assert.deepEqual(cheapestStops(search(120,[station("cheap",60,1)]),input),[]);
  assert.deepEqual(cheapestStops(search(120,[]),input),[]);
});
test("skips a dear station when a cheaper one is within reach",()=>{
  const selected=cheapestStops(search(600,[station("dear",200,4.5),station("cheap",300,3)]),input);
  assert.deepEqual(ids(selected),["cheap"]);
});
test("buys a little at a dear station only to reach the cheap one",()=>{
  // 357 usable miles on a full tank; from a quarter tank only "dear" is in reach, and "cheap" is 150 miles on.
  const settings={...input,initialFuelPercent:25}, stations=[station("dear",30,4.5),station("cheap",180,3)];
  assert.deepEqual(ids(cheapestStops(search(420,stations),settings)),["dear","cheap"]);
  const plan=buildFuelPlan(search(420,stations),settings,stations,route([30,150,240]));
  assert.ok(Math.abs(plan.stops[0].buyGallons-4.6)<1e-6); // 150 miles at 30 MPG, less the 0.4 gal still above reserve
});
test("no other choice of stops is cheaper",()=>{
  const settings={...input,initialFuelPercent:40};
  const stations=[station("a",40,3.9),station("b",110,3.2),station("c",260,3.6),station("d",380,3.05),station("e",520,3.7),station("f",700,3.3)];
  const best=cost(900,cheapestStops(search(900,stations),settings),settings);
  let checked=0;
  for(let mask=0;mask<1<<stations.length;mask++) {
    const subset=stations.filter((_,i)=>mask&1<<i);
    let other:number;
    try {other=cost(900,subset,settings);} catch {continue;} // out of range without more stops
    checked++;
    assert.ok(best<=other+1e-6,`${ids(subset)} costs ${other}, less than ${best}`);
  }
  assert.ok(checked>3);
});
test("a station far off the route counts its own detour against its price",()=>{
  const near=station("near",200,3.5), far={...station("far",200,3.45),detourMiles:40};
  assert.deepEqual(ids(cheapestStops(search(450,[near,far]),input)),["near"]);
  assert.deepEqual(ids(cheapestStops(search(450,[near,{...far,price:{...far.price!,perGallon:2}}]),input)),["far"]);
});
test("stations without a usable price are never chosen, and an unreachable trip says where it stops",()=>{
  const unpriced={...station("unpriced",300),price:null}, settings={...input,requireStationPrices:true};
  assert.throws(()=>cheapestStops(search(600,[unpriced]),settings),/no further than mile 0 of 600/);
  assert.throws(()=>cheapestStops(search(900,[station("only",300)]),input),/no further than mile 300 of 900/);
  assert.throws(()=>cheapestStops(search(100,[]),{...input,initialFuelPercent:10}),/below your reserve/);
});
test("longer real roads stretch the estimates, which can force an extra stop",()=>{
  const stations=[station("a",150),station("b",340)], searched=search(520,stations);
  assert.deepEqual(ids(cheapestStops(searched,input)),["b"]);
  assert.equal(worstLegRatio(searched,[stations[1]],route([374,180])),1.1);
  assert.deepEqual(ids(cheapestStops(searched,input,1.1)),["a","b"]);
});
test("buys only enough at the expensive stop to reach cheaper fuel with reserve",()=>{
  const stations=[station("expensive",60,4.5),station("cheap",180,3)];
  const plan=buildFuelPlan(search(300,stations),{...input,initialFuelPercent:35},stations,route([60,120,120]));
  assert.ok(Math.abs(plan.stops[0].buyGallons-3.2)<0.00001);
  assert.ok(Math.abs(plan.fuelOnArrival-2.1)<0.00001);
  assert.ok(plan.stops.every(s=>s.fuelAfterStop<=14));
  assert.equal(plan.purchaseCost,plan.stops.reduce((sum,stop)=>sum+stop.cost,0));
  assert.ok(!("fuelConsumedCost" in plan));
  assert.ok(!("totalCost" in plan));
});
test("rest stops may buy zero gallons when existing fuel is sufficient",()=>{
  const s=station("rest",60);
  const plan=buildFuelPlan(search(120,[s]),input,[s],route([60,60]));
  assert.equal(plan.stops[0].buyGallons,0);assert.equal(plan.purchaseCost,0);
  assert.equal(plan.gallonsUsed,4);
});
test("actual road distances can reject a candidate that looked reachable on the base route",()=>{
  const s=station("s",60);
  assert.throws(()=>buildFuelPlan(search(120,[s]),{...input,initialFuelPercent:25},[s],route([90,30])),/cannot be reached/);
});
test("a long stretch of driving is a warning, not an error",()=>{
  const plan=buildFuelPlan(search(240,[]),input,[],route([240]));
  assert.ok(plan.warnings.some(w=>/longest stretch between stops is 4h 0m/.test(w)));
  assert.ok(!buildFuelPlan(search(240,[]),input,[],route([240]),300).warnings.some(w=>/longest stretch/.test(w)));
  assert.ok(buildFuelPlan(search(180,[]),input,[],route([180],[179.6]),170).warnings.some(w=>/is 3h 0m/.test(w)));
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
test("regional cards follow the earliest route occurrence even when stations arrive unsorted or unpriced",()=>{
  const stations=[{...station("mo-late",220,4),state:"MO"},station("il",120,3.5),{...station("mo-early",20),state:"MO",price:null}];
  const originalIds=stations.map(station=>station.id);
  const regions=regionalPrices(stations);
  assert.deepEqual(regions.map(region=>region.state),["MO","IL"]);
  assert.equal(regions[0].average,4);
  assert.equal(regions[0].count,1);
  assert.equal(regions[0].change,null);
  assert.equal(regions[1].change,-0.5);
  assert.deepEqual(stations.map(station=>station.id),originalIds);
});
test("explicit route state order includes endpoints without stations and recomputes adjacent price changes",()=>{
  const reports=[
    {state:"IN",average:3.1},{state:"IL",average:3.3},{state:"OK",average:3.7},{state:"MO",average:3.5},{state:"KY",average:3.4},
  ].map(report=>({...report,count:0,kind:"regional report" as const,source:{title:report.state,url:`https://example.com/${report.state}`},observedAt:"2026-11-15T00:00:00Z",change:null}));
  const stations=[station("il",150,4),{...station("mo",70,4.1),state:"MO"}];
  const regions=regionalPrices(stations,reports,["OK","MO","IL","MO","IN"]);
  assert.deepEqual(regions.map(region=>region.state),["OK","MO","IL","IN","KY"]);
  assert.equal(regions[0].source?.title,"OK");
  assert.equal(regions[0].change,null);
  assert.ok(Math.abs(regions[1].change!+0.2)<0.00001);
  assert.ok(Math.abs(regions[2].change!+0.2)<0.00001);
  assert.ok(Math.abs(regions[3].change!+0.2)<0.00001);
  assert.deepEqual(reports.map(region=>region.state),["IN","IL","OK","MO","KY"]);
});
test("server accepts vehicle specifications without confirmation and rejects invalid parameters",()=>{
  assert.equal(parseFuelPreferences(input).vehicle.make,"Toyota");
  for(const bad of [{estimatedPrice:NaN},{reservePercent:0},{vehicle:{...input.vehicle,mpg:0}},{vehicle:{...input.vehicle,tankGallons:0}},{vehicle:{...input.vehicle,grade:"unknown"}}]) {
    assert.throws(()=>parseFuelPreferences({...input,...bad}));
  }
});
test("departure preserves the trip's calendar day and validates real dates",()=>{
  const body=input;
  assert.equal(parseFuelPreferences({...body,departure:"2026-11-27"}).departure,"2026-11-27");
  assert.equal(parseFuelPreferences({...body,departure:"2024-02-29"}).departure,"2024-02-29");
  assert.equal(parseFuelPreferences(body).departure,input.departure);
  for(const departure of ["2026-02-29","2026-02-31","2026-13-01",""]) {
    assert.throws(()=>parseFuelPreferences({...body,departure}),/Departure date|departure date/);
  }
});

test("strict station prices never substitute state averages or fallback values",()=>{
  const settings={...input,requireStationPrices:true,estimatedPrice:9};
  const s=station("exact",60,3.25);
  const reports=[{state:"IL",average:8,count:0,kind:"regional report" as const,source:null,observedAt:null,change:null}];
  assert.equal(stationPrice(s,settings,reports)?.value,3.25);
  assert.equal(stationPrice(s,settings,reports)?.kind,"web report");
  assert.equal(stationPrice({...s,price:null},settings,reports),null);
  for(const price of [
    {...s.price!,observedAt:new Date(Date.now()-73*3600000).toISOString()},
    {...s.price!,observedAt:new Date(Date.now()+2*3600000).toISOString()},
    {...s.price!,source:{title:"missing",url:""}},
    {...s.price!,source:{title:"unsafe",url:"javascript:alert(1)"}},
  ])assert.equal(stationPrice({...s,price},settings,reports),null);
});

test("strict zero-purchase trips record zero cash cost while selected stops still require quotes",()=>{
  const settings={...input,requireStationPrices:true,estimatedPrice:9};
  const s=station("rest",60,3.5), searched=search(120,[s]);
  searched.regions=[{state:"IL",average:8,count:0,kind:"regional report",source:null,observedAt:null,change:null}];
  const plan=buildFuelPlan(searched,settings,[s],route([60,60]));
  assert.equal(plan.purchaseCost,0);
  assert.equal(plan.gallonsUsed,4);
  assert.ok(plan.stops.every(stop=>stop.priceKind==="web report"));
  const unknown={...s,price:null};
  assert.throws(()=>buildFuelPlan(search(120,[unknown]),settings,[unknown],route([60,60])),/no recent, verified station price/);
  const direct=buildFuelPlan(search(60,[]),settings,[],route([60]));
  assert.equal(direct.purchaseCost,0);
  assert.equal(direct.gallonsPurchased,0);
  assert.equal(direct.gallonsUsed,2);
  assert.equal(direct.fuelOnArrival,12);
});

test("legacy nonfuel cost inputs are ignored rather than charged or monetized",()=>{
  const parsed=parseFuelPreferences({...input,timeValue:999,otherCosts:50000});
  assert.ok(!("timeValue" in parsed));
  assert.ok(!("otherCosts" in parsed));
  const stations=[station("one",60,3.2),station("two",180,3.1)];
  const settings={...parsed,initialFuelPercent:35};
  const plan=buildFuelPlan(search(300,stations),settings,stations,route([60,120,120]));
  assert.equal(plan.purchaseCost,plan.stops.reduce((sum,stop)=>sum+stop.buyGallons*stop.pricePerGallon,0));
  assert.ok(!("totalCost" in plan));
});
