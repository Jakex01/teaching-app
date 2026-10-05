CREATE TABLE "board_elements" (
	"room_id" text NOT NULL,
	"element_id" text NOT NULL,
	"position" bigint NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "board_elements_room_id_element_id_pk" PRIMARY KEY("room_id","element_id")
);
