import { sql } from "drizzle-orm";
import { pgTable, text, integer, bigserial, index, uniqueIndex, check } from "drizzle-orm/pg-core";
const order = () => bigserial("rowid", {mode:"number"}).unique();
export const lobbyPosts = pgTable("shared_lobby_posts", {
 rowid: order(), id:text("id").primaryKey(),tripId:text("trip_id").notNull().unique(),ownerId:text("owner_id").notNull(),ownerName:text("owner_name").notNull(),origin:text("origin").notNull(),destination:text("destination").notNull(),startDate:text("start_date").notNull(),endDate:text("end_date").notNull(),memberCount:integer("member_count").notNull(),note:text("note").notNull(),publishedAt:text("published_at").notNull()
},t=>[check("post_dates",sql`${t.endDate} >= ${t.startDate}`),check("post_members",sql`${t.memberCount}>0`)]);
export const joinRequests=pgTable("shared_lobby_requests",{
 rowid:order(),id:text("id").primaryKey(),postId:text("post_id").notNull(),tripId:text("trip_id").notNull(),applicantId:text("applicant_id").notNull(),applicantName:text("applicant_name").notNull(),message:text("message").notNull(),status:text("status").notNull(),score:integer("score").notNull(),createdAt:text("created_at").notNull(),respondedAt:text("responded_at"),closedBy:text("closed_by")
},t=>[uniqueIndex("shared_lobby_one_pending_request_per_person_trip").on(t.applicantId,t.tripId).where(sql`${t.status}='pending'`),index("shared_lobby_requests_trip").on(t.tripId),index("shared_lobby_requests_applicant").on(t.applicantId),check("request_status",sql`${t.status} in ('pending','accepted','declined')`),check("request_score",sql`${t.score} between 0 and 100`),check("request_closed_by",sql`${t.closedBy} in ('answerer','gone','asked','left')`)]);
export const tripMessages=pgTable("shared_lobby_messages",{
 rowid:order(),id:text("id").primaryKey(),tripId:text("trip_id").notNull(),senderId:text("sender_id").notNull(),senderName:text("sender_name").notNull(),body:text("body").notNull(),sentAt:text("sent_at").notNull()
},t=>[index("shared_lobby_messages_trip").on(t.tripId,t.sentAt),check("message_length",sql`length(trim(${t.body})) between 1 and 2000`)]);
