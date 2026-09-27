// Board elements. The same schemas validate data in the browser and on the server.

import { z } from 'zod';

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
} as const;

export const elementId = z.string().regex(/^[A-Za-z0-9_-]{1,32}$/);
export const roomId = z.string().regex(/^[a-z0-9-]{1,40}$/);
export const coord = z.number().min(-LIMITS.coord).max(LIMITS.coord);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

const length = z.number().min(0).max(LIMITS.coord * 2);
const size = z.number().min(0.5).max(200);
const by = z.string().max(32).optional();

export const StrokeSchema = z.object({
  id: elementId, color: hexColor, by, type: z.literal('stroke'),
  pts: z.array(z.tuple([coord, coord])).min(1).max(LIMITS.points),
  size, hl: z.boolean(),
});

export const ShapeSchema = z.object({
  id: elementId, color: hexColor, by, type: z.enum(['rect', 'ellipse', 'triangle']),
  x: coord, y: coord, w: length, h: length, size, fill: z.boolean(),
});

export const LineSchema = z.object({
  id: elementId, color: hexColor, by, type: z.enum(['line', 'arrow']),
  x1: coord, y1: coord, x2: coord, y2: coord, size,
});

export const TextSchema = z.object({
  id: elementId, color: hexColor, by, type: z.literal('text'),
  x: coord, y: coord, text: z.string().max(LIMITS.text), fs: z.number().min(4).max(400),
});

// Images are stored as files; the element only holds their address inside this app.
// The pattern keeps it to our own asset URLs: no outside links (tracking) and no data: URLs.
export const assetSrc = z.string().regex(/^\/api\/assets\/[a-z0-9-]{1,40}\/[A-Za-z0-9_-]{22}\.(webp|png|jpg|gif)$/);

export const ImageSchema = z.object({
  id: elementId, by, type: z.literal('image'),
  src: assetSrc,
  x: coord, y: coord,
  w: z.number().min(1).max(LIMITS.coord), h: z.number().min(1).max(LIMITS.coord),
  rot: z.number().min(-Math.PI * 2).max(Math.PI * 2), // radians, around the centre
});

export const ElementSchema = z.discriminatedUnion('type', [StrokeSchema, ShapeSchema, LineSchema, TextSchema, ImageSchema]);

export type StrokeEl = z.infer<typeof StrokeSchema>;
export type ShapeEl = z.infer<typeof ShapeSchema>;
export type LineEl = z.infer<typeof LineSchema>;
export type TextEl = z.infer<typeof TextSchema>;
export type ImageEl = z.infer<typeof ImageSchema>;
export type BoardElement = z.infer<typeof ElementSchema>;
