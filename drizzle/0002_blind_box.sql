CREATE TABLE "blind_box_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"round_id" uuid NOT NULL,
	"submitted_by_id" text NOT NULL,
	"idea" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blind_box_rounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"settings" jsonb NOT NULL,
	"result" jsonb,
	"saved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "blind_box_rounds_trip_id_unique" UNIQUE("trip_id")
);
--> statement-breakpoint
ALTER TABLE "blind_box_options" ADD CONSTRAINT "blind_box_options_round_id_blind_box_rounds_id_fk" FOREIGN KEY ("round_id") REFERENCES "public"."blind_box_rounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blind_box_options" ADD CONSTRAINT "blind_box_options_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blind_box_rounds" ADD CONSTRAINT "blind_box_rounds_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blind_box_options_round_id_idx" ON "blind_box_options" USING btree ("round_id");