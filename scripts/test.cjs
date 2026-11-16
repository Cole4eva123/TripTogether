// Sequential files share only an explicitly named disposable PostgreSQL test database.
const {spawnSync}=require("node:child_process");
const {readdirSync}=require("node:fs");
const files=readdirSync("lib").filter(f=>f.endsWith(".test.ts")).map(f=>"lib/"+f);
const result=spawnSync(process.execPath,["--experimental-strip-types","--no-warnings","--test","--test-concurrency=1",...files],{stdio:"inherit",env:{...process.env,TRIPTOGETHER_TEST:"1",DATABASE_URL:process.env.TEST_DATABASE_URL||"postgresql://triptogether:triptogether@localhost:55433/triptogether_test_lobby"}});
process.exitCode=result.status??1;
