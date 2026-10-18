CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`workspace` text NOT NULL,
	`name` text NOT NULL,
	`person` text NOT NULL,
	`owner` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sessions_workspace` ON `sessions` (`workspace`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_code_unique` ON `workspaces` (`code`);