CREATE TABLE `answers` (
	`attempt_id` text NOT NULL,
	`question_id` text NOT NULL,
	`selected_json` text DEFAULT '[]' NOT NULL,
	`numeric_value` real,
	`answered_at` integer DEFAULT (unixepoch()) NOT NULL,
	`is_correct` integer,
	`awarded_marks` real,
	PRIMARY KEY(`attempt_id`, `question_id`),
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`student_id` text NOT NULL,
	`status` text DEFAULT 'in_progress' NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deadline_at` integer NOT NULL,
	`submitted_at` integer,
	`device_token` text,
	`question_order_json` text DEFAULT '[]' NOT NULL,
	`score` real,
	`max_score` real,
	`violation_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_exam_student_unique` ON `attempts` (`exam_id`,`student_id`);--> statement-breakpoint
CREATE INDEX `attempts_exam_idx` ON `attempts` (`exam_id`);--> statement-breakpoint
CREATE INDEX `attempts_student_idx` ON `attempts` (`student_id`);--> statement-breakpoint
CREATE TABLE `batch_students` (
	`batch_id` text NOT NULL,
	`student_id` text NOT NULL,
	`joined_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`batch_id`, `student_id`),
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`student_id`) REFERENCES `students`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `batch_students_student_idx` ON `batch_students` (`student_id`);--> statement-breakpoint
CREATE TABLE `batches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`copied_from_batch_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE TABLE `exam_paper_items` (
	`exam_id` text NOT NULL,
	`position` integer NOT NULL,
	`question_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`marks` real NOT NULL,
	PRIMARY KEY(`exam_id`, `position`),
	FOREIGN KEY (`exam_id`) REFERENCES `exams`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `exams` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`duration_minutes` integer NOT NULL,
	`join_code` text NOT NULL,
	`shuffle_questions` integer DEFAULT false NOT NULL,
	`shuffle_options` integer DEFAULT false NOT NULL,
	`lock_to_device` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`published_at` integer,
	`closed_at` integer,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `exams_join_code_unique` ON `exams` (`join_code`);--> statement-breakpoint
CREATE INDEX `exams_batch_idx` ON `exams` (`batch_id`);--> statement-breakpoint
CREATE TABLE `module_questions` (
	`module_id` text NOT NULL,
	`question_id` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`module_id`, `question_id`),
	FOREIGN KEY (`module_id`) REFERENCES `question_modules`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `question_modules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`parent_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `question_modules_parent_idx` ON `question_modules` (`parent_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`subtopic_id` text NOT NULL,
	`type` text NOT NULL,
	`prompt` text NOT NULL,
	`media_key` text,
	`options_json` text DEFAULT '[]' NOT NULL,
	`correct_json` text DEFAULT '[]' NOT NULL,
	`marks` real DEFAULT 1 NOT NULL,
	`negative_marks` real DEFAULT 0 NOT NULL,
	`explanation` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `questions_subtopic_idx` ON `questions` (`subtopic_id`);--> statement-breakpoint
CREATE TABLE `students` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`roll_no` text NOT NULL,
	`roll_no_normalized` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `students_roll_unique` ON `students` (`roll_no_normalized`);--> statement-breakpoint
CREATE TABLE `teacher_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`teacher_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`teacher_id`) REFERENCES `teachers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `teacher_sessions_teacher_idx` ON `teacher_sessions` (`teacher_id`);--> statement-breakpoint
CREATE TABLE `teachers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text NOT NULL,
	`role` text DEFAULT 'teacher' NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teachers_email_unique` ON `teachers` (`email`);--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE INDEX `topics_parent_idx` ON `topics` (`parent_id`);--> statement-breakpoint
CREATE TABLE `violations` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`type` text NOT NULL,
	`occurred_at` integer NOT NULL,
	`received_at` integer DEFAULT (unixepoch()) NOT NULL,
	`detail` text,
	FOREIGN KEY (`attempt_id`) REFERENCES `attempts`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `violations_attempt_idx` ON `violations` (`attempt_id`);