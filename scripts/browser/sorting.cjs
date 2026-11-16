const {assert,BASE,call,person,check}=require("./fixtures.cjs");
check(async browser=>{
 const reader=await person(browser,"Sorting reader"),publisher=await person(browser,"Sorting publisher");
 const day=n=>new Date(Date.now()+n*86400000).toISOString().slice(0,10);const tag="sort-"+Date.now();
 const own=(await call(reader.context,"/trips","POST",{origin:"Boston",destination:"Chicago",startDate:day(10),endDate:day(40)})).trip;
 const candidates=[];
 for(const [destination,start,end]of [["Chicago",10,40],["Denver",20,21],["Boston",5,7],["Paris",-10,-5]]){
  const trip=(await call(publisher.context,"/trips","POST",{origin:"Boston",destination,startDate:day(start),endDate:day(end)})).trip;
  const post=(await call(publisher.context,"/lobby","POST",{tripId:trip.id,note:tag})).post;candidates.push(post);
 }
 const expected={closest:[0,1,2,3],soonest:[2,0,1,3],"soonest-end":[2,1,0,3]};
 for(const [sort,order]of Object.entries(expected)){
  const data=await call(reader.context,`/lobby?against=${own.id}&q=${tag}&sort=${sort}`);
  assert.deepEqual(data.others.map(p=>p.id),order.map(i=>candidates[i].id));
 }
 await reader.page.goto(BASE+"/trips/lobby");await reader.page.getByLabel("Search by destination or note").fill(tag);
 for(const [sort,order]of Object.entries(expected)){
  await reader.page.getByLabel("Sort by",{exact:true}).selectOption(sort);
  await reader.page.waitForFunction(({names})=>JSON.stringify([...document.querySelectorAll('article[data-mine="false"] h3')].map(x=>x.textContent))===JSON.stringify(names),{names:order.map(i=>candidates[i].destination)});
 }
 require("node:fs").mkdirSync("review-artifacts",{recursive:true});
 await reader.page.screenshot({path:"review-artifacts/lobby-balanced-desktop.png"});
 await reader.page.getByRole("button",{name:"Choose from date",exact:true}).click();
 const calendar=reader.page.getByRole("dialog",{name:"From date calendar"});await calendar.waitFor();assert.ok(!/[日月年]/.test(await calendar.textContent()));await reader.page.keyboard.press("Escape");
 await reader.page.getByLabel("From date",{exact:true}).fill("2027-02-31");await reader.page.getByText("Use a valid date: YYYY-MM-DD.").waitFor();
 const invalid=await reader.context.request.get(BASE+"/api/lobby?from=2027-02-31");assert.equal(invalid.status(),400);
 const reversed=await reader.context.request.get(BASE+"/api/lobby?from=2027-06-10&to=2027-06-01");assert.equal(reversed.status(),400);
 await reader.page.setViewportSize({width:390,height:844});assert.ok(await reader.page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 assert.deepEqual(reader.errors,[]);
}).catch(e=>{console.error(e);process.exitCode=1});
