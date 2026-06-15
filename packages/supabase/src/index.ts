/**
 * @intertaind/supabase — typed bridge between the database and the apps.
 *
 * The big surface here is `database.types.ts`, which is auto-generated
 * by `pnpm gen:types` from the live Supabase schema (via the linked
 * project). That file is committed so typechecking works without the
 * CLI installed, but it IS a generated artifact — DO NOT edit by hand.
 * To change it: change the schema (a new migration in `supabase/
 * migrations/`), push it, then regenerate.
 *
 * Everything below is ergonomic wrappers around the raw generated
 * `Database` type — the names match the conventions Supabase's own
 * docs and SDK use, so anything you find in their guides translates
 * directly.
 */

import type { Database as GeneratedDatabase } from "./database.types";

/** The raw generated `Database` type. Useful for `createClient<Database>(...)`. */
export type Database = GeneratedDatabase;

/** Union of every public table name. */
export type TableName = keyof Database["public"]["Tables"];

/** Union of every public view name. */
export type ViewName = keyof Database["public"]["Views"];

/** Union of every public enum name. */
export type EnumName = keyof Database["public"]["Enums"];

/**
 * The row shape of a table — what you get back from `.select()`.
 *   const m: Tables<"media_items"> = ...
 */
export type Tables<T extends TableName> =
  Database["public"]["Tables"][T]["Row"];

/**
 * The insert shape of a table — what `.insert()` accepts. Optional
 * columns (defaults, nullable, generated) come through as optional.
 */
export type TablesInsert<T extends TableName> =
  Database["public"]["Tables"][T]["Insert"];

/**
 * The update shape of a table — `.update()` payload. All fields
 * optional (partial update), with constraints preserved.
 */
export type TablesUpdate<T extends TableName> =
  Database["public"]["Tables"][T]["Update"];

/**
 * The row shape of a view. Views don't have insert/update variants.
 */
export type Views<T extends ViewName> =
  Database["public"]["Views"][T]["Row"];

/**
 * Values of a Postgres enum.
 *   type Status = Enums<"tracking_status">
 *   const s: Status = "completed"  // typesafe against the live schema
 */
export type Enums<T extends EnumName> = Database["public"]["Enums"][T];
