CREATE TABLE "lobby_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lobby_posts_trip_id_unique" UNIQUE("trip_id")
);
--> statement-breakpoint
CREATE TABLE "lobby_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"applicant_id" text NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"closed_by" text,
	"score" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"responded_at" timestamp with time zone,
	CONSTRAINT "lobby_requests_status_check" CHECK ("lobby_requests"."status" in ('pending', 'accepted', 'declined')),
	CONSTRAINT "lobby_requests_closed_by_check" CHECK ("lobby_requests"."closed_by" in ('answerer', 'asked', 'gone'))
);
--> statement-breakpoint
CREATE TABLE "trip_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"body" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "lobby_posts" ADD CONSTRAINT "lobby_posts_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_requests" ADD CONSTRAINT "lobby_requests_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lobby_requests" ADD CONSTRAINT "lobby_requests_applicant_id_users_id_fk" FOREIGN KEY ("applicant_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_messages" ADD CONSTRAINT "trip_messages_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_messages" ADD CONSTRAINT "trip_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "lobby_requests_trip_id_idx" ON "lobby_requests" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "lobby_requests_applicant_id_idx" ON "lobby_requests" USING btree ("applicant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lobby_requests_one_pending_key" ON "lobby_requests" USING btree ("applicant_id","trip_id") WHERE "lobby_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "trip_messages_trip_id_sent_at_idx" ON "trip_messages" USING btree ("trip_id","sent_at");