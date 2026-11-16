import assert from "node:assert/strict";
import { test } from "node:test";
import { publicLobby, publicPost, publicRequest } from "./lobby-privacy.ts";
import type { JoinRequest, LobbyPost, LobbyView } from "./types.ts";
const post:LobbyPost={id:"post-id",tripId:"trip-id",ownerId:"private-owner",ownerName:"Private Owner Name",origin:"Boston",destination:"Chicago",startDate:"2027-06-01",endDate:"2027-06-05",memberCount:2,note:"A scenic drive",publishedAt:"2027-01-01T00:00:00Z"};
const request:JoinRequest={id:"abc123-4567",postId:post.id,tripId:post.tripId,applicantId:"private-applicant",applicantName:"Private Applicant Name",message:"I enjoy hiking",status:"pending",score:60,createdAt:post.publishedAt,respondedAt:null,closedBy:null};
test("lobby HTTP projection removes names, personal ids and chat previews while retaining route and request actions",()=>{
 const members=[{id:"private-owner",name:"Private Owner Name"},{id:"private-member",name:"Private Member Name"}];
 const card={...post,mine:false,publishedByMe:false,score:60,reasons:[],datesClash:false,ended:false,members,basis:null,myRequest:request};
 const input:LobbyView={mine:[],others:[card],requests:[{request,role:"applicant",post,trip:post,members,gone:false,lastMessage:{id:"msg",tripId:post.tripId,senderId:"private-owner",senderName:"Private Owner Name",body:"Private chat content",sentAt:post.publishedAt}}]};
 const output=publicLobby(input);const json=JSON.stringify(output);
 for(const secret of ["Private Owner Name","Private Applicant Name","Private Member Name","private-owner","private-applicant","private-member","Private chat content"])assert.ok(!json.includes(secret),secret+" leaked");
 assert.equal(output.others[0].origin,"Boston");assert.equal(output.others[0].destination,"Chicago");assert.equal(output.others[0].members.length,2);
 assert.equal(output.requests[0].request.id,request.id);assert.equal(output.requests[0].request.status,"pending");assert.equal(output.requests[0].request.applicantName,"Request ABC123");assert.equal(output.requests[0].lastMessage,null);
 assert.equal(input.others[0].members[0].name,"Private Owner Name","projection must not mutate internal data");
});
test("publish and application HTTP responses use the same redaction policy",()=>{
 assert.equal(publicPost(post).ownerName,"");assert.equal(publicPost(post).ownerId,"");assert.equal(publicRequest(request).applicantName,"Request ABC123");assert.equal(publicRequest(request).applicantId,"");assert.equal(publicRequest(request).id,request.id);
});
