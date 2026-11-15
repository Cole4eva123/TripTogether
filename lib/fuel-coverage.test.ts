import assert from "node:assert/strict";
import {test} from "node:test";
import type {FuelPreferences,RoadRoute,RoutePoint,Station} from "./fuel-types.ts";
import type {PlanningSearch} from "./gasoline-intelligence.ts";
import {findCoverageGaps,selectStops} from "./gasoline-intelligence.ts";
import {coverageSearchPoints,fillStationCoverage,pointAlongRoute} from "./fuel-coverage.ts";

const input:FuelPreferences={origin:"Tahlequah, OK",destination:"Urbana, IL",departure:"2026-11-14T12:00:00Z",
  vehicle:{year:2010,make:"Toyota",model:"Corolla",trim:"LE",mpg:34,tankGallons:13.2,grade:"regular"},
  initialFuelPercent:85,reservePercent:25,intervalMinutes:90,stopMinutes:20,maxDetourMinutes:15,
  amenities:["Restroom","McDonald's"],memberships:[],estimatedPrice:3.5,timeValue:15,otherCosts:0};
const route:RoadRoute={origin:{lat:35.91,lng:-94.97},destination:{lat:40.11,lng:-88.2},miles:570.836,minutes:649.613,
  points:[{lat:35.91,lng:-94.97,miles:0,minutes:0},{lat:40.11,lng:-88.2,miles:570.836,minutes:649.613}],legs:[{miles:570.836,minutes:649.613}]};
function station(id:string,point:RoutePoint):Station {
  return {id,name:id,brand:id,address:"A sourced station address",state:"MO",location:point,
    routeMiles:point.miles,routeMinutes:point.minutes,detourMiles:0,detourMinutes:2,
    amenities:[],membersOnly:false,price:null,open:"Unknown",mapUrl:"https://www.openstreetmap.org"};
}
// The reported route left a ~4h prefix gap and a ~4h final gap in the original live search.
const original:PlanningSearch={route,regions:[],stations:[0.1,236,295,352,363,409,412].map((minutes,i)=>station(`original-${i}`,pointAlongRoute(route,minutes)))};

test("the reported Corolla parameters fail because of coverage, not McDonald's or break duration",()=>{
  const gaps=findCoverageGaps(original,input);
  assert.equal(gaps.length,2);assert.ok(gaps.every(g=>g.reason==="driving time"));
  assert.throws(()=>selectStops(original,input),/station coverage is missing/);
  assert.throws(()=>selectStops(original,{...input,amenities:[],stopMinutes:5}),/station coverage is missing/);
});
test("gap searches cover both ends of the route and interpolate missing road points",()=>{
  const points=coverageSearchPoints(original,input);
  assert.ok(points.some(p=>p.minutes>0 && p.minutes<236));
  assert.ok(points.some(p=>p.minutes>412 && p.minutes<route.minutes));
  assert.ok(points.length<=6);
  assert.equal(pointAlongRoute(route,route.minutes/2).miles,route.miles/2);
});
test("targeted station discovery repairs the reported case without relaxing reserve or driving limits",async()=>{
  let calls=0;
  const repaired=await fillStationCoverage(original,input,async points=>{
    calls++;return points.map((p,i)=>station(`extra-${i}`,p));
  });
  assert.equal(calls,1);assert.ok(repaired.warnings.some(w=>w.includes("Expanded the search")));
  const stops=selectStops({...original,stations:repaired.stations},input);
  const positions=[0,...stops.map(s=>s.routeMinutes),route.minutes];
  assert.ok(positions.slice(1).every((t,i)=>t-positions[i]<=180));
  assert.equal(input.initialFuelPercent,85);assert.equal(input.reservePercent,25);
});
test("already covered routes do not trigger additional paid station searches",async()=>{
  const covered={...original,stations:[90,180,270,360,450,540,630].map((t,i)=>station(`covered-${i}`,pointAlongRoute(route,t)))};
  const result=await fillStationCoverage(covered,input,async()=>{assert.fail("unnecessary station lookup");});
  assert.deepEqual(result.stations,covered.stations);assert.equal(result.warnings.length,0);
});
test("failed supplemental searches retain the existing stations and still reject unsafe plans",async()=>{
  const result=await fillStationCoverage(original,input,async()=>{throw new Error("offline");});
  assert.equal(result.stations.length,original.stations.length);assert.equal(result.warnings.length,1);
  assert.throws(()=>selectStops({...original,stations:result.stations},input),/station coverage is missing/);
});
test("supplemental searches are bounded and do not add duplicate stations",async()=>{
  let calls=0;
  const result=await fillStationCoverage(original,input,async()=>{calls++;return original.stations;});
  assert.equal(calls,1);assert.equal(result.stations.length,original.stations.length);
});
test("low starting fuel places the first search point within the current usable range",()=>{
  const low={...input,initialFuelPercent:30};
  const points=coverageSearchPoints({...original,stations:[]},low);
  const available=13.2*(30-25)/100*34;
  assert.ok(points[0].miles>0 && points[0].miles<available);
});
test("exact driving-time and reserve boundaries remain valid, while exceeding either is rejected",()=>{
  const miles=input.vehicle.tankGallons*(input.initialFuelPercent-input.reservePercent)/100*input.vehicle.mpg;
  const boundary={...original,stations:[],route:{...route,miles,minutes:180}};
  assert.deepEqual(selectStops(boundary,input),[]);
  assert.throws(()=>selectStops({...boundary,route:{...boundary.route,minutes:180.1}},input),/three-hour driving limit/);
  assert.throws(()=>selectStops({...boundary,route:{...boundary.route,miles:miles+0.01}},input),/available fuel range/);
});
