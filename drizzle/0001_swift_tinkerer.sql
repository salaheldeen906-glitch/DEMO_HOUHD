CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace` text NOT NULL,
	`person` text NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`salt` text NOT NULL,
	`role` text NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_username_unique` ON `accounts` (`username`);--> statement-breakpoint
CREATE INDEX `accounts_workspace` ON `accounts` (`workspace`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace` text NOT NULL,
	`expense` text NOT NULL,
	`object_key` text NOT NULL,
	`name` text NOT NULL,
	`mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`created` text NOT NULL,
	`actor` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attachments_expense` ON `attachments` (`expense`);--> statement-breakpoint
CREATE TABLE `login_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `sessions` ADD `role` text DEFAULT 'employee' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `account` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `sessions` ADD `expires` integer DEFAULT 0 NOT NULL;