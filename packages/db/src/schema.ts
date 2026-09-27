// Database schema (Drizzle ORM, Postgres). A first slice of the data model in docs/ARCHITECTURE.md.
// Change it here, then run `npm run db:generate` to create a migration.

import { sql } from 'drizzle-orm';
import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  ...timestamps,
});

export const teacherProfiles = pgTable('teacher_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  subjects: text('subjects').array().notNull().default(sql`'{}'::text[]`),
  timezone: text('timezone').notNull().default('Europe/Warsaw'),
  ...timestamps,
});

export const studentStatus = pgEnum('student_status', ['active', 'archived']);

// A teacher–student relationship plus the teacher's notes about the student.
export const students = pgTable('students', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').notNull().references(() => teacherProfiles.userId, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // student's own account, later
  firstName: text('first_name').notNull(),
  lastName: text('last_name'),
  color: text('color').notNull(),
  subject: text('subject'),
  level: text('level'),
  goal: text('goal'),
  notes: text('notes'),
  status: studentStatus('status').notNull().default('active'),
  ...timestamps,
}, t => [index('students_teacher_idx').on(t.teacherId)]);

// A student's notebook-board. `roomId` is the live-sync room until pages move to Yjs.
export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  roomId: text('room_id').notNull().unique(),
  ...timestamps,
}, t => [index('boards_student_idx').on(t.studentId)]);

// Personal sign-in links for students (no e-mail needed). Only a SHA-256 hash of the token is stored.
export const studentAccessLinks = pgTable('student_access_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [index('student_access_links_student_idx').on(t.studentId)]);

export const lessonStatus = pgEnum('lesson_status', ['scheduled', 'done', 'cancelled']);

export const lessons = pgTable('lessons', {
  id: uuid('id').primaryKey().defaultRandom(),
  teacherId: uuid('teacher_id').notNull().references(() => teacherProfiles.userId, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
  topic: text('topic'),
  videoUrl: text('video_url'),
  status: lessonStatus('status').notNull().default('scheduled'),
  ...timestamps,
}, t => [
  index('lessons_teacher_starts_idx').on(t.teacherId, t.startsAt),
  index('lessons_student_idx').on(t.studentId),
]);

export type User = typeof users.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type StudentAccessLink = typeof studentAccessLinks.$inferSelect;
export type LessonStatus = Lesson['status'];
