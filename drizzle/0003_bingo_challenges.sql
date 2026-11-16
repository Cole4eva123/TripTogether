CREATE TABLE "bingo_challenge_tasks" (
	"challenge_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "bingo_challenge_tasks_challenge_id_position_pk" PRIMARY KEY("challenge_id","position")
);
--> statement-breakpoint
CREATE TABLE "bingo_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"region" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"size" integer NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"withdrawn_at" timestamp with time zone
);
--> statement-breakpoint
-- Cards drawn at random from before challenges have no challenge to point at; their squares go with them.
DELETE FROM "bingo_cards";--> statement-breakpoint
ALTER TABLE "bingo_cards" ADD COLUMN "challenge_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "bingo_challenge_tasks" ADD CONSTRAINT "bingo_challenge_tasks_challenge_id_bingo_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."bingo_challenges"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_challenge_tasks" ADD CONSTRAINT "bingo_challenge_tasks_task_id_bingo_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."bingo_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bingo_challenges" ADD CONSTRAINT "bingo_challenges_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bingo_challenges_region_idx" ON "bingo_challenges" USING btree ("region");--> statement-breakpoint
ALTER TABLE "bingo_cards" ADD CONSTRAINT "bingo_cards_challenge_id_bingo_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."bingo_challenges"("id") ON DELETE no action ON UPDATE no action;