// Database schema (Drizzle ORM, Postgres). A first slice of the data model in docs/ARCHITECTURE.md.
// Change it here, then run `npm run db:generate` to create a migration.

import { sql } from 'drizzle-orm';
import { type AnyPgColumn, bigint, index, jsonb, pgEnum, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
};

// One account per person. A teacher also has a teacher_profiles row; a student is linked to
// one or more teachers through students.user_id.
export const userRole = pgEnum('user_role', ['teacher', 'student']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').unique(),
  displayName: text('display_name').notNull(),
  role: userRole('role').notNull(),
  // Set once the person has shown they read this inbox (accepted an e-mailed invitation or reset link).
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  // scrypt hash (see passwords.ts). Null = the account can't sign in with a password.
  passwordHash: text('password_hash'),
  passwordUpdatedAt: timestamp('password_updated_at', { withTimezone: true }),
  ...timestamps,
});

// Sign-in with an outside provider (Google). `providerUserId` is the provider's stable id ("sub"),
// never the e-mail, which can change.
export const oauthAccounts = pgTable('oauth_accounts', {
  provider: text('provider').notNull(), // 'google'
  providerUserId: text('provider_user_id').notNull(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.provider, t.providerUserId] }), index('oauth_accounts_user_idx').on(t.userId)]);

// Signed-in browsers. The cookie holds a random token; only its SHA-256 hash is stored here,
// so a copy of the database can't be used to take over sessions.
export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(), // sha256(token), hex
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
}, t => [index('sessions_user_idx').on(t.userId)]);

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
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }), // the student's own account, once invited
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

// A student's boards: the notebook every student starts with, one board per lesson, and free boards
// (a mock exam, revision). `roomId` is the live-sync room.
export const boardKind = pgEnum('board_kind', ['notebook', 'lesson', 'free']);

export const boards = pgTable('boards', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  roomId: text('room_id').notNull().unique(),
  kind: boardKind('kind').notNull().default('free'),
  // The lesson this board belongs to (kind 'lesson'). One board per lesson.
  lessonId: uuid('lesson_id').unique().references((): AnyPgColumn => lessons.id, { onDelete: 'set null' }),
  lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
  ...timestamps,
}, t => [
  index('boards_student_idx').on(t.studentId),
  // Exactly one notebook per student.
  uniqueIndex('boards_one_notebook_idx').on(t.studentId).where(sql`kind = 'notebook'`),
]);

// Personal sign-in links for students (no e-mail needed). Only a SHA-256 hash of the token is stored.
export const studentAccessLinks = pgTable('student_access_links', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [index('student_access_links_student_idx').on(t.studentId)]);

// Who agreed to the terms when a student account was created (under 16, a parent must agree: GDPR art. 8).
export const inviteConsent = pgEnum('invite_consent', ['student_16_plus', 'guardian']);

// E-mail invitations from a teacher to a student (or parent). Single-use, expiring; only the token's hash is stored.
export const studentInvitations = pgTable('student_invitations', {
  id: uuid('id').primaryKey().defaultRandom(),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
  email: text('email').notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
  consent: inviteConsent('consent'),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, t => [index('student_invitations_student_idx').on(t.studentId)]);

// "Forgot password" links. Single-use, valid for an hour; only the token's hash is stored.
export const passwordResets = pgTable('password_resets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
}, t => [index('password_resets_user_idx').on(t.userId)]);

// AI hints, kept per task image (SHA-256 of the file plus the prompt version), so the same exam task
// for another student doesn't call the AI again. Holds only the task, never anything about a student.
export const taskHints = pgTable('task_hints', {
  key: text('key').primaryKey(),
  hints: jsonb('hints').notNull(),
  model: text('model').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

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

// Everything drawn on a board, one row per element, so saving only touches what changed.
// `roomId` is the live-sync room: a student notebook's boards.room_id (b-…) or an open demo room.
// `data` is validated with the shared zod ElementSchema before it's written and after it's read.
export const boardElements = pgTable('board_elements', {
  roomId: text('room_id').notNull(),
  elementId: text('element_id').notNull(),
  position: bigint('position', { mode: 'number' }).notNull(), // drawing order within the room
  data: jsonb('data').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.roomId, t.elementId] })]);

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Student = typeof students.$inferSelect;
export type Board = typeof boards.$inferSelect;
export type Lesson = typeof lessons.$inferSelect;
export type StudentInvitation = typeof studentInvitations.$inferSelect;
export type UserRole = User['role'];
export type StudentAccessLink = typeof studentAccessLinks.$inferSelect;
export type LessonStatus = Lesson['status'];
