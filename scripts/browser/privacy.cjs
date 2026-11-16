const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
const BASE = process.env.BASE_URL || 'http://localhost:3002';
(async()=>{
 const browser=await chromium.launch();
 try {
  const context=await browser.newContext({viewport:{width:1440,height:1050}});
  const login=await context.request.post(BASE+'/api/auth/login',{data:{email:'maya@example.com',password:'roadtrip1'}});assert.equal(login.status(),200);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE+'/trips/lobby');await page.locator('#your-group article').first().waitFor();
  const response=await context.request.get(BASE+'/api/lobby');assert.equal(response.status(),200);const data=await response.json();
  for(const post of [...data.mine,...data.others]){
   assert.equal(post.ownerName,'');assert.equal(post.ownerId,'');
   for(const member of post.members)assert.equal(member.name,'');
   if(post.myRequest){assert.match(post.myRequest.applicantName,/^Request /);assert.equal(post.myRequest.applicantId,'');}
  }
  for(const item of data.requests){assert.match(item.request.applicantName,/^Request /);assert.equal(item.request.applicantId,'');assert.equal(item.post.ownerName,'');assert.equal(item.trip.ownerName,'');assert.equal(item.lastMessage,null);}
  const card=page.locator('#your-group article').filter({hasText:'Two of us, hotel booked.'}).first();
  await card.getByRole('heading',{name:'Chicago',exact:true}).waitFor();
  const origin=card.getByText('Champaign, IL',{exact:true});await origin.waitFor();
  const originSize=await origin.evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
  const destinationSize=await card.getByRole('heading',{name:'Chicago',exact:true}).evaluate(el=>parseFloat(getComputedStyle(el).fontSize));assert.ok(destinationSize>originSize);
  const cards=await page.locator('article').allTextContents();for(const name of ['Maya Chen','Ben Ortiz','Sam Okafor','Lea Park'])assert.ok(cards.every(text=>!text.includes(name)),name+' appeared on a card');
  assert.equal(await page.getByRole('heading',{name:'Shared lobby',exact:true}).evaluate(el=>el.closest('header').classList.contains('bg-green')),false);
  fs.mkdirSync('review-artifacts',{recursive:true});await page.screenshot({path:'review-artifacts/lobby-refined-desktop.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'review-artifacts/lobby-refined-mobile.png'});
  await page.locator('#discover-heading').scrollIntoViewIfNeeded();await page.screenshot({path:'review-artifacts/lobby-refined-mobile-filters.png'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.getByLabel('Search by destination or note').fill('no-such-place-private-test');await page.getByText('No trips match your filters.',{exact:false}).waitFor();
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.locator('article[data-mine="false"]').first().waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: names redacted in HTTP and cards, request aliases, route hierarchy, compact header, filters and 390px layout');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
