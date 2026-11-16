import type { JoinRequest, LobbyPost, LobbyView, Member } from "./types.ts";
import { requestLabel } from "./lobby-labels.ts";
const anonymousMembers = (members: Member[]) => members.map((_, index) => ({ id: `traveler-${index + 1}`, name: "" }));
export const publicPost = <T extends LobbyPost>(post:T):T => ({...post, ownerId:"", ownerName:""});
export const publicRequest = (request:JoinRequest):JoinRequest => ({...request,applicantId:"",applicantName:requestLabel(request.id)});
/** Redact at the HTTP boundary: card data must not carry names or private chat previews. */
export function publicLobby(view:LobbyView):LobbyView {
 const card = (post:LobbyView["mine"][number]) => ({...publicPost(post),members:anonymousMembers(post.members),myRequest:post.myRequest ? publicRequest(post.myRequest) : null});
 return {...view,mine:view.mine.map(card),others:view.others.map(card),requests:view.requests.map(item=>({...item,request:publicRequest(item.request),post:publicPost(item.post),trip:publicPost(item.trip),members:anonymousMembers(item.members),lastMessage:null}))};
}
