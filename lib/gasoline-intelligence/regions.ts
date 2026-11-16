import type { FuelGrade, RegionPrice } from "./types.ts";

const states:Record<string,string>=Object.fromEntries("Alabama:AL,Alaska:AK,Arizona:AZ,Arkansas:AR,California:CA,Colorado:CO,Connecticut:CT,Delaware:DE,Florida:FL,Georgia:GA,Hawaii:HI,Idaho:ID,Illinois:IL,Indiana:IN,Iowa:IA,Kansas:KS,Kentucky:KY,Louisiana:LA,Maine:ME,Maryland:MD,Massachusetts:MA,Michigan:MI,Minnesota:MN,Mississippi:MS,Missouri:MO,Montana:MT,Nebraska:NE,Nevada:NV,New Hampshire:NH,New Jersey:NJ,New Mexico:NM,New York:NY,North Carolina:NC,North Dakota:ND,Ohio:OH,Oklahoma:OK,Oregon:OR,Pennsylvania:PA,Rhode Island:RI,South Carolina:SC,South Dakota:SD,Tennessee:TN,Texas:TX,Utah:UT,Vermont:VT,Virginia:VA,Washington:WA,West Virginia:WV,Wisconsin:WI,Wyoming:WY,District of Columbia:DC".split(",").map(entry=>entry.split(":")));
export const normalizeState=(value:string)=>states[value] || value.replace(/^US-/,"").toUpperCase();
export const AAA_URL="https://gasprices.aaa.com/state-gas-price-averages/";
const plain=(html:string)=>html.replace(/<[^>]*>/g," ").replace(/&nbsp;|&#160;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();
// Parse facts from the published table; a changed layout or stale date yields no data, never guesses.
export function parseStatePriceTable(html:string,grade:FuelGrade,now=Date.now()):RegionPrice[] {
  const match=plain(html).match(/Price as of\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})/i);
  if(!match)return [];
  const month=Number(match[1]),day=Number(match[2]),year=Number(match[3])+(match[3].length===2?2000:0);
  const date=new Date(Date.UTC(year,month-1,day)),time=date.getTime();
  if(date.getUTCMonth()!==month-1 || date.getUTCDate()!==day || now-time>7*86400000 || time-now>86400000)return [];
  const index={regular:1,midgrade:2,premium:3,diesel:4}[grade];
  const result:RegionPrice[]=[];
  for(const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells=[...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>plain(cell[1]));
    const state=states[cells[0]],price=Number(cells[index]?.replace(/[^0-9.]/g,""));
    if(!state || cells.length<5 || !Number.isFinite(price) || price<0.5 || price>15)continue;
    result.push({state,average:price,count:0,kind:"regional report",source:{title:"AAA state fuel price averages",url:AAA_URL},observedAt:date.toISOString(),change:null});
  }
  return result;
}
