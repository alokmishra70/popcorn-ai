CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"prefix" text NOT NULL,
	"hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
CREATE TABLE "datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"agent_name" text,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"eval_run_id" uuid NOT NULL,
	"test_case_id" uuid NOT NULL,
	"run_id" uuid,
	"attempt" integer DEFAULT 0 NOT NULL,
	"passed" boolean NOT NULL,
	"check_results" jsonb NOT NULL,
	"judge_reason" text,
	"judge_verdict_correct" boolean,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"duration_ms" double precision DEFAULT 0 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"git_sha" text,
	"git_branch" text,
	"label" text,
	"model" text,
	"prompt_hash" text,
	"repeat" integer DEFAULT 1 NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"total" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"pass_rate" real DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"p95_latency_ms" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fixtures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"span_id" uuid NOT NULL,
	"tool_name" text NOT NULL,
	"args_hash" text NOT NULL,
	"result" jsonb,
	"is_error" boolean DEFAULT false NOT NULL,
	"start_ms" double precision NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fixtures_span_id_unique" UNIQUE("span_id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"cost_threshold_usd" double precision DEFAULT 0.5 NOT NULL,
	"max_steps" integer DEFAULT 25 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" double precision,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_usd" double precision DEFAULT 0 NOT NULL,
	"flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"span_count" integer DEFAULT 0 NOT NULL,
	"step_count" integer DEFAULT 0 NOT NULL,
	"models" text[] DEFAULT '{}'::text[] NOT NULL,
	"tools" text[] DEFAULT '{}'::text[] NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" text,
	"replay_of_run_id" uuid,
	"eval_run_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"start_ms" double precision NOT NULL,
	"end_ms" double precision NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"provider" text,
	"model" text,
	"tokens_in" integer,
	"tokens_out" integer,
	"cache_read_tokens" integer,
	"cache_write_tokens" integer,
	"cost_usd" double precision,
	"attributes" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"source_run_id" uuid,
	"name" text NOT NULL,
	"input" jsonb,
	"expected" jsonb,
	"checks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "datasets" ADD CONSTRAINT "datasets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_eval_run_id_eval_runs_id_fk" FOREIGN KEY ("eval_run_id") REFERENCES "public"."eval_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_results" ADD CONSTRAINT "eval_results_test_case_id_test_cases_id_fk" FOREIGN KEY ("test_case_id") REFERENCES "public"."test_cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eval_runs" ADD CONSTRAINT "eval_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fixtures" ADD CONSTRAINT "fixtures_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "spans_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spans" ADD CONSTRAINT "spans_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_dataset_id_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_project_idx" ON "api_keys" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "datasets_project_name_idx" ON "datasets" USING btree ("project_id","name");--> statement-breakpoint
CREATE INDEX "eval_results_run_idx" ON "eval_results" USING btree ("eval_run_id");--> statement-breakpoint
CREATE INDEX "eval_results_case_idx" ON "eval_results" USING btree ("test_case_id");--> statement-breakpoint
CREATE INDEX "eval_runs_dataset_idx" ON "eval_runs" USING btree ("dataset_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "fixtures_lookup_idx" ON "fixtures" USING btree ("run_id","tool_name","args_hash");--> statement-breakpoint
CREATE INDEX "runs_project_started_idx" ON "runs" USING btree ("project_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "runs_flags_idx" ON "runs" USING gin ("flags");--> statement-breakpoint
CREATE INDEX "runs_models_idx" ON "runs" USING gin ("models");--> statement-breakpoint
CREATE INDEX "runs_tools_idx" ON "runs" USING gin ("tools");--> statement-breakpoint
CREATE INDEX "runs_replay_of_idx" ON "runs" USING btree ("replay_of_run_id");--> statement-breakpoint
CREATE INDEX "spans_run_idx" ON "spans" USING btree ("run_id","start_ms");--> statement-breakpoint
CREATE INDEX "spans_project_kind_idx" ON "spans" USING btree ("project_id","kind","name");--> statement-breakpoint
CREATE INDEX "spans_search_idx" ON "spans" USING gin (to_tsvector('simple', left(coalesce("input"::text, '') || ' ' || coalesce("output"::text, ''), 200000)));--> statement-breakpoint
CREATE INDEX "test_cases_dataset_idx" ON "test_cases" USING btree ("dataset_id");