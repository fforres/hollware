CREATE TABLE `uploads` (
	`id` text PRIMARY KEY NOT NULL,
	`site_id` text NOT NULL,
	`key` text NOT NULL,
	`multipart_id` text NOT NULL,
	`filename` text NOT NULL,
	`alt` text NOT NULL,
	`bytes` integer NOT NULL,
	`part_bytes` integer NOT NULL,
	`created_by` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`site_id`) REFERENCES `sites`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "uploads_sizes" CHECK("uploads"."bytes" > 0 AND "uploads"."part_bytes" >= 5242880 AND length("uploads"."alt") BETWEEN 1 AND 500 AND length("uploads"."filename") BETWEEN 1 AND 200)
);
--> statement-breakpoint
CREATE INDEX `uploads_expiry` ON `uploads` (`expires_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uploads_id_site` ON `uploads` (`id`,`site_id`);