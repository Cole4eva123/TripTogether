const {assert,BASE,call,person,publish,ownCard,check}=require("./fixtures.cjs");
check(async browser=>{
 const owner=await person(browser,"Notification owner"),applicant=await person(browser,"Notification applicant");
 const {trip,post}=await publish(owner);
 const initial=owner.page.waitForResponse(r=>r.url().endsWith("/api/lobby")&&r.request().method()==="GET");
 await owner.page.goto(BASE+"/trips");await initial;
 assert.equal(await owner.page.getByTestId("join-request-count").count(),0);
 let request=(await call(applicant.context,"/join-requests","POST",{postId:post.id,message:"Notify owner"})).request;
 await owner.page.getByTestId("join-request-count").getByText("1",{exact:true}).waitFor({timeout:15000});
 assert.equal((await call(applicant.context,"/lobby")).pendingRequestCount,0);
 await owner.page.getByRole("link",{name:/^Shared lobby/}).click();
 await owner.page.getByText("Someone wants to join your trip.",{exact:false}).waitFor();
 await owner.page.getByLabel("Search by destination or note").fill("not-visible-notification-filter");
 await owner.page.getByText("No trips match your filters.",{exact:false}).waitFor();
 await owner.page.getByRole("button",{name:"Review requests",exact:true}).click();
 await ownCard(owner.page).getByRole("button",{name:"Decline",exact:true}).click();
 await owner.page.getByTestId("join-request-count").waitFor({state:"detached",timeout:15000});
 request=(await call(applicant.context,"/join-requests","POST",{postId:post.id})).request;
 await owner.page.getByTestId("join-request-count").waitFor({timeout:15000});
 await call(applicant.context,`/join-requests/${request.id}`,"PATCH",{action:"withdraw"});
 await owner.page.getByTestId("join-request-count").waitFor({state:"detached",timeout:15000});
 request=(await call(applicant.context,"/join-requests","POST",{postId:post.id})).request;
 await owner.page.getByTestId("join-request-count").waitFor({timeout:15000});
 await ownCard(owner.page).getByRole("button",{name:"Let them join",exact:true}).click();
 await owner.page.getByTestId("join-request-count").waitFor({state:"detached",timeout:15000});
 assert.equal((await call(applicant.context,"/trips")).trips.some(t=>t.id===trip.id),true);
 assert.deepEqual(owner.errors,[]);await call(owner.context,`/trips/${trip.id}`,"DELETE");
}).catch(e=>{console.error(e);process.exitCode=1});

