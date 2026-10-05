CREATE TYPE "public"."board_kind" AS ENUM('notebook', 'lesson', 'free');--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "kind" "board_kind" DEFAULT 'free' NOT NULL;--> statement-breakpoint
-- Until now every student had exactly one board: their notebook.
UPDATE "boards" SET "kind" = 'notebook';--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "lesson_id" uuid;--> statement-breakpoint
ALTER TABLE "boards" ADD COLUMN "last_opened_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "boards_one_notebook_idx" ON "boards" USING btree ("student_id") WHERE kind = 'notebook';--> statement-breakpoint
ALTER TABLE "boards" ADD CONSTRAINT "boards_lesson_id_unique" UNIQUE("lesson_id");