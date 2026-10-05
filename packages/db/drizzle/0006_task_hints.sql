CREATE TABLE "task_hints" (
	"key" text PRIMARY KEY NOT NULL,
	"hints" jsonb NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
