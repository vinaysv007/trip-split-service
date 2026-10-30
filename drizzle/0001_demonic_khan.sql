CREATE TYPE "public"."member_role" AS ENUM('admin', 'member');--> statement-breakpoint
CREATE TYPE "public"."split_type" AS ENUM('equal', 'exact');--> statement-breakpoint
CREATE TABLE "expense_splits" (
	"expense_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"share" numeric(14, 2) NOT NULL,
	"base_share" numeric(14, 2) NOT NULL,
	CONSTRAINT "expense_splits_expense_id_member_id_pk" PRIMARY KEY("expense_id","member_id"),
	CONSTRAINT "expense_splits_share_check" CHECK ("expense_splits"."share" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"payer_member_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"currency" char(3) NOT NULL,
	"fx_rate" numeric(18, 8) NOT NULL,
	"base_amount" numeric(14, 2) NOT NULL,
	"split_type" "split_type" NOT NULL,
	"expense_date" date NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount" > 0),
	CONSTRAINT "expenses_fx_rate_check" CHECK ("expenses"."fx_rate" > 0)
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"code" text NOT NULL,
	"created_by_member_id" uuid NOT NULL,
	"claim_member_id" uuid,
	"max_uses" integer,
	"use_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_code_unique" UNIQUE("code"),
	CONSTRAINT "invites_max_uses_check" CHECK ("invites"."max_uses" IS NULL OR "invites"."max_uses" > 0),
	CONSTRAINT "invites_use_count_check" CHECK ("invites"."use_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "settlements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"from_member_id" uuid NOT NULL,
	"to_member_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"settled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settlements_members_check" CHECK ("settlements"."from_member_id" <> "settlements"."to_member_id"),
	CONSTRAINT "settlements_amount_check" CHECK ("settlements"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "trip_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"user_id" uuid,
	"display_name" text NOT NULL,
	"role" "member_role" DEFAULT 'member' NOT NULL,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"base_currency" char(3) NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"start_date" date,
	"end_date" date,
	"archived_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trips_dates_check" CHECK ("trips"."end_date" IS NULL OR "trips"."start_date" IS NULL OR "trips"."end_date" >= "trips"."start_date")
);
--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_member_id_trip_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_member_id_trip_members_id_fk" FOREIGN KEY ("payer_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_created_by_member_id_trip_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_claim_member_id_trip_members_id_fk" FOREIGN KEY ("claim_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_from_member_id_trip_members_id_fk" FOREIGN KEY ("from_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_to_member_id_trip_members_id_fk" FOREIGN KEY ("to_member_id") REFERENCES "public"."trip_members"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_members" ADD CONSTRAINT "trip_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_admin_user_id_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_splits_member_id_idx" ON "expense_splits" USING btree ("member_id");--> statement-breakpoint
CREATE INDEX "expenses_trip_date_idx" ON "expenses" USING btree ("trip_id","expense_date");--> statement-breakpoint
CREATE INDEX "expenses_payer_member_id_idx" ON "expenses" USING btree ("payer_member_id");--> statement-breakpoint
CREATE INDEX "invites_trip_id_idx" ON "invites" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "settlements_trip_id_idx" ON "settlements" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_members_trip_id_idx" ON "trip_members" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "trip_members_user_id_idx" ON "trip_members" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "trip_members_trip_user_uq" ON "trip_members" USING btree ("trip_id","user_id") WHERE "trip_members"."user_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "trip_members_one_admin_uq" ON "trip_members" USING btree ("trip_id") WHERE "trip_members"."role" = 'admin';--> statement-breakpoint
CREATE INDEX "trips_admin_user_id_idx" ON "trips" USING btree ("admin_user_id");