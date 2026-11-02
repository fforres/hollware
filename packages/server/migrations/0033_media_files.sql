CREATE TABLE `__new_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`sha256` text NOT NULL,
	`format` text NOT NULL,
	`width` integer,
	`height` integer,
	`bytes` integer NOT NULL,
	`widths` text DEFAULT '[]' NOT NULL,
	`original_format` text NOT NULL,
	`original_bytes` integer NOT NULL,
	`alt` text NOT NULL,
	`filename` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "assets_formats" CHECK("format" IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf') AND "original_format" IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif', 'image/svg+xml', 'video/mp4', 'video/webm', 'application/pdf')),
	CONSTRAINT "assets_sizes" CHECK("bytes" > 0 AND "original_bytes" > 0 AND length("alt") BETWEEN 1 AND 500 AND length("filename") BETWEEN 1 AND 200 AND length("sha256") = 64)
);
--> statement-breakpoint
INSERT INTO `__new_assets`("id", "site_id", "sha256", "format", "width", "height", "bytes", "widths", "original_format", "original_bytes", "alt", "filename", "created_by", "created_at", "updated_at") SELECT "id", "site_id", "sha256", "format", "width", "height", "bytes", "widths", "original_format", "original_bytes", "alt", "filename", "created_by", "created_at", "updated_at" FROM `assets`;--> statement-breakpoint
DROP TABLE `assets`;--> statement-breakpoint
ALTER TABLE `__new_assets` RENAME TO `assets`;--> statement-breakpoint
CREATE INDEX `assets_site_time` ON `assets` (`site_id`,`created_at`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_id_site` ON `assets` (`id`,`site_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `assets_sha256` ON `assets` (`site_id`,`sha256`);
--> statement-breakpoint
CREATE TRIGGER `assets_no_delete`
BEFORE DELETE ON `assets`
BEGIN
	SELECT RAISE(ABORT, 'append-only: an asset is never deleted, since a revision may name it');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_immutable`
BEFORE UPDATE OF `id`, `site_id`, `sha256`, `format`, `width`, `height`, `bytes`, `original_format`, `original_bytes`, `filename`, `created_by`, `created_at` ON `assets`
WHEN NOT (
	EXISTS (SELECT 1 FROM `anonymizations` WHERE `site_id` = OLD.`site_id` AND `user_id` = OLD.`created_by`)
	AND NEW.`created_by` = 'usr_00000000000000000000000000'
	AND NEW.`id` IS OLD.`id` AND NEW.`site_id` IS OLD.`site_id` AND NEW.`sha256` IS OLD.`sha256` AND NEW.`format` IS OLD.`format` AND NEW.`width` IS OLD.`width` AND NEW.`height` IS OLD.`height` AND NEW.`bytes` IS OLD.`bytes` AND NEW.`original_format` IS OLD.`original_format` AND NEW.`original_bytes` IS OLD.`original_bytes` AND NEW.`filename` IS OLD.`filename` AND NEW.`created_at` IS OLD.`created_at`
)
BEGIN
	SELECT RAISE(ABORT, 'append-only: only the alt of an asset changes');
END;
