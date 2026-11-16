import type { FuelGrade, Source, VehicleSuggestion } from "./types";
import { FuelError } from "./validation";
import { providerJson, safeUrl } from "./http";
import { ResearchCache } from "./ai-cache";
import { VEHICLE_BUDGET_MS, remainingFuelMs, withFuelBudget } from "./budget";
import { RESEARCH_SYSTEM, extractionSystem, vehicleResearchPrompt, VEHICLE_SCHEMA } from "./prompts";

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
  ],false,1000);
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
