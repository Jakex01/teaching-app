// Board elements. The same schemas validate data in the browser and on the server.

import { z } from 'zod';

// No code generation inside zod (it would use new Function): the app's Content-Security-Policy forbids eval.
z.config({ jitless: true });

export const LIMITS = {
  coord: 1_000_000,       // how far from the centre anything may be drawn
  points: 5000,           // points in one pen stroke
  text: 2000,             // characters in one text box
  name: 24,               // characters in a display name
  batch: 500,             // elements in one upsert message
  elementsPerRoom: 20_000,
  clientsPerRoom: 100,
  imageBytes: 5 * 1024 * 1024, // one uploaded image
  imageSide: 2048,             // images are scaled down to this before upload
  imagesPerRoom: 300,
  hints: 3,                    // hints per task card
  hintText: 400,               // characters in one hint
  uploadsPerMinute: 60,        // per person; a PDF worksheet becomes one image per task
  pdfPages: 40,                // pages read from one PDF (a CKE exam sheet has about 30)
  pdfPieces: 40,               // images placed from one PDF
} as const;

export const elementId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
export const roomId = z.string().regex(/^[a-z0-9-]{1,40}$/);
export const coord = z.number().min(-LIMITS.coord).max(LIMITS.coord);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const length = z.number().min(0).max(LIMITS.coord * 2);
const size = z.number().min(0.5).max(200);
const by = z.string().max(32).optional();
// Elements with the same group move and get selected together (e.g. a drawing made by AI).
const group = elementId.optional();

export const StrokeSchema = z.object({
  id: elementId, color: hexColor, by, group, type: z.literal('stroke'),
  // [x, y], or [x, y, pressure 0–1] from a pen (Apple Pencil, graphics tablet).
  pts: z.array(z.union([z.tuple([coord, coord]), z.tuple([coord, coord, z.number().min(0).max(1)])])).min(1).max(LIMITS.points),
  size, hl: z.boolean(),
});

export const ShapeSchema = z.object({
  id: elementId, color: hexColor, by, group, type: z.enum(['rect', 'ellipse', 'triangle']),
  x: coord, y: coord, w: length, h: length, size, fill: z.boolean(),
  rot: z.number().min(-Math.PI * 2).max(Math.PI * 2).optional(), // radians, around the centre
});

export const LineSchema = z.object({
  id: elementId, color: hexColor, by, group, type: z.enum(['line', 'arrow']),
  x1: coord, y1: coord, x2: coord, y2: coord, size,
});

export const TextSchema = z.object({
  id: elementId, color: hexColor, by, group, type: z.literal('text'),
  x: coord, y: coord, text: z.string().max(LIMITS.text), fs: z.number().min(4).max(400),
});

// Images are stored as files; the element only holds their address inside this app.
// The pattern keeps it to our own asset URLs: no outside links (tracking) and no data: URLs.
export const assetSrc = z.string().regex(/^\/api\/assets\/[a-z0-9-]{1,40}\/[A-Za-z0-9_-]{22}\.(webp|png|jpg|gif)$/);

export const ImageSchema = z.object({
  id: elementId, by, group, type: z.literal('image'),
  src: assetSrc,
  x: coord, y: coord,
  w: z.number().min(1).max(LIMITS.coord), h: z.number().min(1).max(LIMITS.coord),
  rot: z.number().min(-Math.PI * 2).max(Math.PI * 2), // radians, around the centre
});

// A worksheet task card: the task (an image placed in its left part) and room for the solution (right part),
// on one coloured background so it's clear what belongs together. It grows downwards as the solution gets longer.
export const TaskCardSchema = z.object({
  id: elementId, by, type: z.literal('task'), color: hexColor,
  x: coord, y: coord, w: length, h: length,
  split: z.number().min(0).max(LIMITS.coord * 2), // where the solution area starts, measured from x
  label: z.string().max(40),
  /** Height of the task image at the top of the left part; the hints go below it. */
  taskH: z.number().min(0).max(LIMITS.coord * 2).optional(),
  /** Hints that guide the student's thinking (from AI), and how many of them are shown so far. */
  hints: z.array(z.string().min(1).max(LIMITS.hintText)).max(LIMITS.hints).optional(),
  shown: z.number().int().min(0).max(LIMITS.hints).optional(),
});

// A titled part of a board ("Matura próbna styczeń 2025"): a big frame that holds task cards and notes.
export const SectionSchema = z.object({
  id: elementId, by, type: z.literal('section'), color: hexColor,
  x: coord, y: coord, w: length, h: length,
  title: z.string().trim().min(1).max(80),
});

export const ElementSchema = z.discriminatedUnion('type', [StrokeSchema, ShapeSchema, LineSchema, TextSchema, ImageSchema, TaskCardSchema, SectionSchema]);

export type StrokeEl = z.infer<typeof StrokeSchema>;
export type ShapeEl = z.infer<typeof ShapeSchema>;
export type LineEl = z.infer<typeof LineSchema>;
export type TextEl = z.infer<typeof TextSchema>;
export type ImageEl = z.infer<typeof ImageSchema>;
export type TaskCardEl = z.infer<typeof TaskCardSchema>;
export type SectionEl = z.infer<typeof SectionSchema>;
export type BoardElement = z.infer<typeof ElementSchema>;
