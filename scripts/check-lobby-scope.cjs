/* eslint-disable @typescript-eslint/no-require-imports -- Read-only scope audit. */
const {execFileSync}=require("node:child_process");
const fs=require("node:fs");
const assert=require("node:assert/strict");
const baseline="9b6339f";
const allowed=new Set([".gitignore","README.md","app/trips/layout.tsx","app/trips/[id]/page.tsx","docs/api.md","eslint.config.mjs","lib/types.ts","lib/validate.ts","package.json","package-lock.json"]);
const paths=execFileSync("git",["ls-tree","-r","--name-only",baseline],{encoding:"utf8"}).trim().split("\n");
let protectedCount=0;
for(const p of paths){if(allowed.has(p))continue;assert.ok(fs.existsSync(p),"Missing baseline file: "+p);assert.deepEqual(fs.readFileSync(p),execFileSync("git",["show",baseline+":"+p]),"Out-of-scope change: "+p);protectedCount++;}
assert.ok(!fs.readFileSync("app/trips/page.tsx","utf8").includes("Go to the shared lobby"));
console.log("PASS: "+protectedCount+" protected baseline files unchanged; homepage lobby button absent. Only listed feature integrations/shared types/dependencies may differ.");
