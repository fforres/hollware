CREATE TABLE `__new_auth_challenges` (
	`id` text PRIMARY KEY NOT NULL,
	`challenge` text NOT NULL,
	`purpose` text NOT NULL,
	`invitation_id` text,
	`user_id` text,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`provider` text,
	`nonce` text,
	`code_verifier` text,
	`return_to` text,
	CONSTRAINT "auth_challenges_purpose" CHECK("purpose" IN ('register', 'authenticate', 'federate', 'enroll', 'accept'))
);
INSERT INTO `__new_auth_challenges`("id", "challenge", "purpose", "invitation_id", "user_id", "expires_at", "created_at", "updated_at", "provider", "nonce", "code_verifier", "return_to") SELECT "id", "challenge", "purpose", "invitation_id", "user_id", "expires_at", "created_at", "updated_at", "provider", "nonce", "code_verifier", "return_to" FROM `auth_challenges`;--> statement-breakpoint
DROP TABLE `auth_challenges`;--> statement-breakpoint
ALTER TABLE `__new_auth_challenges` RENAME TO `auth_challenges`;--> statement-breakpoint
CREATE TABLE `__new_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`hash` text NOT NULL,
	`role` text NOT NULL,
	`user_id` text,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`email` text,
	`revoked_at` text,
	`sent_at` text,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitations_role" CHECK("role" IN ('owner', 'admin', 'editor', 'author', 'reviewer'))
);
INSERT INTO `__new_invitations`("id", "site_id", "hash", "role", "user_id", "expires_at", "used_at", "created_at", "updated_at", "email") SELECT "id", "site_id", "hash", "role", "user_id", "expires_at", "used_at", "created_at", "updated_at", "email" FROM `invitations`;--> statement-breakpoint
DROP TABLE `invitations`;--> statement-breakpoint
ALTER TABLE `__new_invitations` RENAME TO `invitations`;--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_id_site` ON `invitations` (`id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_hash` ON `invitations` (`hash`);--> statement-breakpoint
CREATE TABLE `__new_members` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "members_role" CHECK("role" IN ('owner', 'admin', 'editor', 'author', 'reviewer'))
);
INSERT INTO `__new_members`("id", "site_id", "user_id", "role", "created_at", "updated_at") SELECT "id", "site_id", "user_id", "role", "created_at", "updated_at" FROM `members`;--> statement-breakpoint
DROP TABLE `members`;--> statement-breakpoint
ALTER TABLE `__new_members` RENAME TO `members`;--> statement-breakpoint
CREATE UNIQUE INDEX `members_id_site` ON `members` (`id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `members_person` ON `members` (`site_id`,`user_id`);