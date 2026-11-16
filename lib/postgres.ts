// PostgreSQL only. Drizzle parameterizes every value; transactions retain one connection across awaits.
import { AsyncLocalStorage } from "node:async_hooks";
import { resolve } from "node:path";
import { Pool, types, type PoolClient } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql as querySql } from "drizzle-orm";
types.setTypeParser(20, Number);
type Value = string | number | null;
const context = new AsyncLocalStorage<PoolClient>();
const globalDb = globalThis as typeof globalThis & { __lobbyPg?: {pool: Pool; ready?: Promise<void>} };
function connection() {
 if(globalDb.__lobbyPg) return globalDb.__lobbyPg;
 const url=process.env.DATABASE_URL;
 if(!url || !/^postgres(ql)?:\/\//.test(url)) throw new Error("Configure DATABASE_URL for PostgreSQL. No alternative database is used.");
 return globalDb.__lobbyPg={pool:new Pool({connectionString:url,max:12})};
}
async function ready() {
 const state=connection();
 state.ready ??= (async()=>{const c=await state.pool.connect();try{
 await c.query("SELECT pg_advisory_lock(4092401)");
 await migrate(drizzle(c),{migrationsFolder:resolve("drizzle"),migrationsSchema:"shared_lobby_migrations",migrationsTable:"migrations"});
 } finally {try {await c.query("SELECT pg_advisory_unlock(4092401)");} finally {c.release();}}})().catch(e=>{state.ready=undefined;throw e;});
 await state.ready;
}
async function query(statement:string, values:Value[]) {
 await ready();
 // SQL identifiers retain the public API's camelCase names in PostgreSQL result rows.
 const parts=statement.replace(/\bas ([a-z][a-zA-Z0-9]*[A-Z][a-zA-Z0-9]*)/g,'as "$1"').split("?");
 if(parts.length!==values.length+1) throw new Error("SQL parameter mismatch");
 const chunks=[];
 for(let i=0;i<parts.length;i++){chunks.push(querySql.raw(parts[i]));if(i<values.length)chunks.push(querySql`${values[i]}`);}
 return drizzle(context.getStore() ?? connection().pool).execute(querySql.join(chunks,querySql.raw("")));
}
export async function all<T>(statement:string,...values:Value[]):Promise<T[]> {return (await query(statement,values)).rows as T[];}
export async function one<T>(statement:string,...values:Value[]):Promise<T|undefined> {return (await all<T>(statement,...values))[0];}
export async function execute(statement:string,...values:Value[]) {return (await query(statement,values)).rowCount ?? 0;}
export async function transaction<T>(action:()=>T|Promise<T>):Promise<T> {
 if(context.getStore())return action();
 await ready();const c=await connection().pool.connect();
 try {await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(4092402)");const result=await context.run(c,action);await c.query("COMMIT");return result;}
 catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();}
}
export function database(){return {exec:async(statement:string)=>{await ready();return (context.getStore() ?? connection().pool).query(statement);}};}
export function requireTestDatabase(){if(process.env.TRIPTOGETHER_TEST!=="1" || !new URL(process.env.DATABASE_URL ?? "postgresql://localhost/invalid").pathname.startsWith("/triptogether_test"))throw new Error("Reset requires an explicitly configured PostgreSQL test database.");}
export async function closeDatabase(){if(globalDb.__lobbyPg){await globalDb.__lobbyPg.pool.end();delete globalDb.__lobbyPg;}}
