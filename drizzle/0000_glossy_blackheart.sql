CREATE TABLE "shared_lobby_requests" (
	"rowid" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"post_id" text NOT NULL,
	"trip_id" text NOT NULL,
	"applicant_id" text NOT NULL,
	"applicant_name" text NOT NULL,
	"message" text NOT NULL,
	"status" text NOT NULL,
	"score" integer NOT NULL,
	"created_at" text NOT NULL,
	"responded_at" text,
	"closed_by" text,
	CONSTRAINT "shared_lobby_requests_rowid_unique" UNIQUE("rowid"),
	CONSTRAINT "request_status" CHECK ("shared_lobby_requests"."status" in ('pending','accepted','declined')),
	CONSTRAINT "request_score" CHECK ("shared_lobby_requests"."score" between 0 and 100),
	CONSTRAINT "request_closed_by" CHECK ("shared_lobby_requests"."closed_by" in ('answerer','gone','asked','left'))
);
--> statement-breakpoint
CREATE TABLE "shared_lobby_posts" (
	"rowid" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"owner_name" text NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"member_count" integer NOT NULL,
	"note" text NOT NULL,
	"published_at" text NOT NULL,
	CONSTRAINT "shared_lobby_posts_rowid_unique" UNIQUE("rowid"),
	CONSTRAINT "shared_lobby_posts_trip_id_unique" UNIQUE("trip_id"),
	CONSTRAINT "post_dates" CHECK ("shared_lobby_posts"."end_date" >= "shared_lobby_posts"."start_date"),
	CONSTRAINT "post_members" CHECK ("shared_lobby_posts"."member_count">0)
);
--> statement-breakpoint
CREATE TABLE "shared_lobby_messages" (
	"rowid" bigserial NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"trip_id" text NOT NULL,
	"sender_id" text NOT NULL,
	"sender_name" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" text NOT NULL,
	CONSTRAINT "shared_lobby_messages_rowid_unique" UNIQUE("rowid"),
	CONSTRAINT "message_length" CHECK (length(trim("shared_lobby_messages"."body")) between 1 and 2000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shared_lobby_one_pending_request_per_person_trip" ON "shared_lobby_requests" USING btree ("applicant_id","trip_id") WHERE "shared_lobby_requests"."status"='pending';--> statement-breakpoint
CREATE INDEX "shared_lobby_requests_trip" ON "shared_lobby_requests" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "shared_lobby_requests_applicant" ON "shared_lobby_requests" USING btree ("applicant_id");--> statement-breakpoint
CREATE INDEX "shared_lobby_messages_trip" ON "shared_lobby_messages" USING btree ("trip_id","sent_at");
--> statement-breakpoint
create or replace function shared_lobby_close_publication() returns trigger language plpgsql as $$
begin
 update shared_lobby_requests set status='declined', closed_by='gone', responded_at=to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') where status='pending' and post_id=OLD.id;
 return OLD;
end $$;
drop trigger if exists shared_lobby_close_publication on shared_lobby_posts;
create trigger shared_lobby_close_publication after delete on shared_lobby_posts for each row execute function shared_lobby_close_publication();
