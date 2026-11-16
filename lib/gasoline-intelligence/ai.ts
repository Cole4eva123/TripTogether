import type { FuelGrade, RegionPrice, RoadRoute, Source, Station, VehicleSuggestion } from "./types";
import { FuelError } from "./validation";
import { providerJson, safeUrl } from "./http";
import { ResearchCache, mapResearch } from "./ai-cache";
import { parseStationQuote } from "./quote";
import { VEHICLE_BUDGET_MS, remainingFuelMs, withFuelBudget } from "./budget";
import { RESEARCH_SYSTEM, extractionSystem, vehicleResearchPrompt, VEHICLE_SCHEMA, STATION_SCHEMA, STATION_RULES, stationSearchQuery, priceResearchPrompt, PRICE_SCHEMA } from "./prompts";

type Message = { content?: string; annotations?: { type?: string; url_citation?: { url?: string; title?: string } }[] };
type Completion = { choices?: { message?: Message; finish_reason?: string }[]; error?: unknown };
async function complete(messages: { role: string; content: string }[], web: boolean, maxTokens = 3000): Promise<Message> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new FuelError("DeepSeek is not configured. Set DEEPSEEK_API_KEY in .env.local, or enter vehicle specifications manually.",503);
  const response = await providerJson<Completion>("https://api.deepseek.com/chat/completions", "DeepSeek", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.DEEPSEEK_MODEL || "deepseek-flash", messages, stream: false,
      thinking: { type: "disabled" }, max_tokens: maxTokens,
      ...(web ? { tools: [{ type: "deepseek_web_search" }, { type: "deepseek_read_url" }] } : { response_format: { type: "json_object" } }),
    }),
  },web ? Math.min(30000,Math.max(1,remainingFuelMs()-10000)) : 10000);
  const choice = response.choices?.[0];
  if (!choice?.message?.content || choice.finish_reason === "length" || response.error) {
    throw new FuelError("DeepSeek returned an incomplete answer. Try a more specific description.",502);
  }
  return choice.message;
}
async function research(question: string) {
  const message = await complete([
    { role: "system", content: RESEARCH_SYSTEM },
    { role: "user", content: question },
  ],true);
  const sources: Source[] = [];
  for (const item of message.annotations ?? []) {
    const citation = item.url_citation, url = safeUrl(citation?.url);
    if (url && !sources.some(s => s.url === url)) sources.push({ title: citation?.title || new URL(url).hostname, url });
  }
  return { content: message.content!, sources };
}
async function extract(content: string, schema: string, rules=""): Promise<Record<string, unknown>> {
  const message = await complete([
    { role: "system", content: extractionSystem(schema, rules) },
    { role: "user", content },
  ],false,schema === STATION_SCHEMA ? 4000 : schema === VEHICLE_SCHEMA ? 1000 : 1800);
  try {
    const result: unknown = JSON.parse(message.content!);
    if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error();
    return result as Record<string,unknown>;
  } catch { throw new FuelError("DeepSeek returned invalid structured data. Try again or enter the specifications manually.",502); }
}
const bounded = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined;
const short = (v: unknown, max = 100) => typeof v === "string" ? v.slice(0,max) : undefined;
async function identifyVehicleUncached(description: string): Promise<VehicleSuggestion> {
  const evidence = await research(vehicleResearchPrompt(description));
  const data = await extract(JSON.stringify(evidence), VEHICLE_SCHEMA);
  const supported = evidence.sources.length > 0;
  const grades = ["regular","midgrade","premium","diesel"];
  return {
    vehicle: {
      year: bounded(data.year,1980,new Date().getFullYear()+2), make: short(data.make,60), model: short(data.model,80), trim: short(data.trim),
      mpg: supported ? bounded(data.mpg,5,100) : undefined,
      tankGallons: supported ? bounded(data.tankGallons,3,100) : undefined,
      grade: grades.includes(String(data.grade)) ? data.grade as FuelGrade : undefined,
    }, sources: evidence.sources,
    notes: (short(data.notes,1000) || "Confirm the exact year, trim, fuel grade and tank capacity before planning.") +
      (!supported ? " No source citations were returned; enter fuel economy and tank capacity from your vehicle specifications." : ""),
  };
}
const vehicleState = globalThis as typeof globalThis & { fuelVehicleResearchCache?: ResearchCache<VehicleSuggestion> };
const vehicleCache = vehicleState.fuelVehicleResearchCache ??= new ResearchCache<VehicleSuggestion>(64, 86400000);
export function identifyVehicle(description: string): Promise<VehicleSuggestion> {
  const key = `${process.env.DEEPSEEK_MODEL || "deepseek-flash"}:${description.trim().replace(/\s+/g, " ").toLowerCase()}`;
  return vehicleCache.run(key, () => withFuelBudget(VEHICLE_BUDGET_MS,()=>identifyVehicleUncached(description)), result => {
    const vehicle = result.vehicle;
    return !!(result.sources.length && vehicle.year && vehicle.make && vehicle.model && vehicle.mpg && vehicle.tankGallons && vehicle.grade);
  });
}
export type ResearchedStation = {name:string;brand:string;address:string;state:string;source:Source;amenities:string[]};
export async function researchStationAddresses(route: RoadRoute, towns:string[],focused=false): Promise<ResearchedStation[]> {
  const key=process.env.DEEPSEEK_API_KEY;
  if(!key)throw new FuelError("Configure DeepSeek to research station addresses.",503);
  type WebResult={title:string;url:string;content?:string;summary?:string;snippet?:string};
  const responses=await Promise.allSettled([...new Set(towns)].map(town=>providerJson<{results:WebResult[]}>("https://api.deepseek.com/v1/tools/search","DeepSeek station search",{
    method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},
    body:JSON.stringify({query:stationSearchQuery(town,focused),count:focused?6:4,need_content:true}),
  },12000)));
  const sources:Source[]=[],pages:{title:string;url:string;content:string}[]=[];
  for(const response of responses)for(const result of response.status === "fulfilled" ? response.value.results ?? [] : []) {
    const url=safeUrl(result.url);
    if(!url || sources.some(s=>s.url===url) || pages.length>=32)continue;
    sources.push({title:result.title,url});
    pages.push({title:result.title,url,content:(result.content || result.summary || result.snippet || "").slice(0,4000)});
  }
  const evidence={sources,content:JSON.stringify({routeMiles:route.miles,towns,pages})};
  if(!evidence.sources.length) throw new FuelError("The station index is unavailable and web research found no citable station addresses. Try again later.",502);
  const data=await extract(JSON.stringify(evidence),STATION_SCHEMA,STATION_RULES);
  const result:ResearchedStation[]=[];
  for(const raw of Array.isArray(data.stations)?data.stations:[]) {
    if(!raw || typeof raw!=="object")continue;
    const item=raw as Record<string,unknown>,source=evidence.sources.find(s=>s.url===safeUrl(item.sourceUrl));
    if(source && typeof item.name==="string" && typeof item.street==="string" && item.street.length>5 && typeof item.city==="string" && item.city.trim() && typeof item.state==="string" && item.state.trim()) {
      const address=[item.street,item.city,item.state,typeof item.postalCode==="string"?item.postalCode:""].filter(Boolean).join(", ").slice(0,250);
      if(!result.some(s=>s.address.toLowerCase()===address.toLowerCase()))result.push({name:item.name.slice(0,120),brand:short(item.brand,100)||item.name.slice(0,100),address,state:item.state.slice(0,60),source,amenities:Array.isArray(item.amenities)?item.amenities.filter((a):a is string=>typeof a==="string"&&a.length<=60).slice(0,8):[]});
    }
    if(result.length===24)break;
  }
  if(!result.length)throw new FuelError("The station index is unavailable and no complete station addresses could be verified from web sources. Try again later.",502);
  return result;
}
function validDate(value: unknown, maxAgeHours: number) {
  if (typeof value !== "string") return null;
  const ms = Date.parse(value), now = Date.now();
  return Number.isFinite(ms) && ms <= now + 3600000 && now-ms <= maxAgeHours*3600000 ? new Date(ms).toISOString() : null;
}
type PriceBatch = { prices: Map<string, NonNullable<Station["price"]>>; reports: RegionPrice[] };
const priceState=globalThis as typeof globalThis & { fuelPriceResearchCache?:ResearchCache<PriceBatch> };
const priceCache=priceState.fuelPriceResearchCache ??=new ResearchCache<PriceBatch>(64,300000);
async function researchPriceBatch(sample: Station[], grade: FuelGrade, regionalStates: string[]):Promise<PriceBatch> {
  const key=JSON.stringify({schemaVersion:2,stations:sample.map(s=>[s.id,s.name,s.address,s.state,s.location]),grade,regionalStates,model:process.env.DEEPSEEK_MODEL});
  return priceCache.run(key,()=>uncachedPriceBatch(sample,grade,regionalStates),value=>value.prices.size>0 || value.reports.length>0);
}
async function uncachedPriceBatch(sample: Station[], grade: FuelGrade, regionalStates: string[]):Promise<PriceBatch> {
  const evidence = await research(priceResearchPrompt(sample, grade, regionalStates));
  const prices = new Map<string, NonNullable<Station["price"]>>();
  const reports: RegionPrice[] = [];
  if (!evidence.sources.length) return { prices, reports };
  const data = await extract(JSON.stringify(evidence), PRICE_SCHEMA);
  for (const raw of Array.isArray(data.stations) ? data.stations : []) {
    const quote=parseStationQuote(raw,sample,grade,evidence.sources);
    if(quote)prices.set(quote.id,quote.price);
  }
  for (const raw of Array.isArray(data.regions) ? data.regions : []) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>, source = evidence.sources.find(s => s.url === safeUrl(entry.sourceUrl));
    const price = bounded(entry.pricePerGallon, 0.5, 15), observedAt = validDate(entry.observedAt, 168);
    if (source && price && observedAt && typeof entry.state === "string" && regionalStates.includes(entry.state)) {
      reports.push({ state: entry.state, average: price, count: 0, kind: "regional report", source, observedAt, change: null });
    }
  }
  return { prices, reports };
}
export async function researchPrices(stations: Station[], grade: FuelGrade, regionalStates?: string[]): Promise<{ stations: Station[]; reports: RegionPrice[]; warning?: string }> {
  if (!process.env.DEEPSEEK_API_KEY) return { stations, reports: [], warning: "DeepSeek is not configured. Prices require your own estimate." };
  // Keep the same evenly distributed 16-station sample, but research independent batches concurrently.
  const sample = stations.length <= 16 ? stations : Array.from({ length: 16 }, (_, i) => stations[Math.round(i * (stations.length - 1) / 15)]);
  const batches: Station[][] = [];
  for (let i = 0; i < sample.length; i += 4) batches.push(sample.slice(i, i + 4));
  const states = [...new Set((regionalStates ?? stations.map(station => station.state)).filter(Boolean))];
  // State averages are requested once, not repeatedly in every station batch.
  const results = await mapResearch(batches, 4, (batch, index) => {
    if(remainingFuelMs()<1000)throw new FuelError("Price lookup time limit reached.",504);
    return researchPriceBatch(batch, grade, index === 0 ? states : []);
  });
  const prices = new Map<string, NonNullable<Station["price"]>>();
  const reports = new Map<string, RegionPrice>();
  let failed = 0;
  for (const result of results) {
    if (result.status === "rejected") { failed++; continue; }
    for (const [id, price] of result.value.prices) if(validDate(price.observedAt,72))prices.set(id, price);
    for (const report of result.value.reports) {
      if(!validDate(report.observedAt,168))continue;
      const previous = reports.get(report.state);
      if (!previous || Date.parse(report.observedAt!) > Date.parse(previous.observedAt!)) reports.set(report.state, report);
    }
  }
  return {
    stations: stations.map(station => ({ ...station, price: prices.get(station.id) ?? station.price })), reports: [...reports.values()],
    warning: `Price reports cover ${sample.length} sampled stations; ${prices.size} had a recent, cited report.${failed ? ` ${failed} research batch${failed === 1 ? " was" : "es were"} unavailable; successful reports were retained.` : ""} Other station prices are unknown or estimates.`,
  };
}
