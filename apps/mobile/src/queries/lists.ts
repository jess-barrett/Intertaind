/**
 * TanStack Query hooks for the list-detail route (`list/[id]`) — a single
 * curated list, its items, and the viewer's like/save state. The RN mirror of
 * web's `apps/web/src/app/lists/[id]/page.tsx` read + `ListSidebarActions`
 * (like/save) + `toggleListLike` / `toggleListSave` (apps/web/src/app/actions/
 * lists.ts).
 *
 * READ (`useListDetail`) fans the page out in the same shape web does:
 *   1. the `lists` row + its author (`profiles!lists_user_id_fkey`),
 *   2. the source media (only for `if_you_liked` / `vibe` lists),
 *   3. the `list_items` → `media_items` join (position-ordered), and
 *   4. the viewer's `list_likes` / `list_saves` rows (signed-in only),
 * with 2–4 run in parallel after the list resolves. Returns `null` when the
 * list isn't found / not visible (RLS) so the screen can render a not-found.
 *
 * WRITE mirrors web's read-then-toggle: check for an existing like/save row,
 * delete it if present (un-toggle) else insert it, and — on the POSITIVE
 * transition only — log a `liked_list` / `saved_list` activity via the shared
 * `@intertaind/types` builders (web parity). A `list_*_counts` trigger owns the
 * denormalized `like_count` / `saves_count` on `lists`, so we optimistically
 * flip the viewer state + count locally and invalidate on settle rather than
 * trusting a hand-computed count.
 *
 * Column subsets are cast (`as unknown as`) exactly as profile.ts / home.ts do:
 * the author embed is a column subset (inferable FK, but narrowed), and the
 * media embeds reuse `HOME_MEDIA_COLS` so `cardMediaFromHomeItem` can adapt each
 * item straight into a `MediaCard`.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { likedListActivity, savedListActivity } from "@intertaind/types";
import type { Tables } from "@intertaind/supabase";

import { useAuth } from "@/components/auth-provider";
import { logActivity } from "@/lib/activity-log";
import { supabase } from "@/lib/supabase";
import { HOME_MEDIA_COLS, type HomeMediaItem } from "@/queries/home";
import { queryKeys } from "./keys";

/** Author subset rendered by the list-detail header. */
export type ListDetailAuthor = Pick<
  Tables<"profiles">,
  "id" | "username" | "display_name" | "avatar_url"
>;

/** The `lists` columns the detail header + sidebar render. */
export type ListDetailSummary = Pick<
  Tables<"lists">,
  | "id"
  | "user_id"
  | "title"
  | "description"
  | "list_type"
  | "ranked"
  | "tags"
  | "media_types"
  | "source_media_id"
  | "visibility"
  | "like_count"
  | "saves_count"
  | "item_count"
>;

/**
 * The media a list item embeds. A superset of `HomeMediaItem` (so
 * `cardMediaFromHomeItem` still adapts it) with the extra columns the
 * backdrop hero + filter/sort controls need: `backdrop_url` (the hero),
 * `metadata` (genre filter + length sort), `tracking_count` (popularity sort).
 */
export type ListItemMedia = HomeMediaItem &
  Pick<
    Tables<"media_items">,
    "backdrop_url" | "metadata" | "tracking_count"
  >;

/** One list item: its position/note/reason/added-time + the embedded media. */
export type ListDetailItem = {
  id: string;
  position: number;
  note: string | null;
  reason: string | null;
  /** `list_items.created_at` — the "Recently added" / "Earliest added" sort. */
  createdAt: string | null;
  media: ListItemMedia | null;
};

/** Everything the list-detail screen renders in one payload. */
export type ListDetailData = {
  list: ListDetailSummary;
  author: ListDetailAuthor;
  /** Only present for `if_you_liked` / `vibe` lists (the "source" block). */
  sourceMedia: HomeMediaItem | null;
  items: ListDetailItem[];
  /** The viewer's like/save state (false when signed out). */
  viewerLiked: boolean;
  viewerSaved: boolean;
};

/** Column list for the `lists` header read. */
const LIST_COLS =
  "id, user_id, title, description, list_type, ranked, tags, media_types, source_media_id, visibility, like_count, saves_count, item_count";

const AUTHOR_EMBED =
  "profiles!lists_user_id_fkey(id, username, display_name, avatar_url)";

/** Item media columns = the home card subset + hero/filter/sort extras. */
const ITEM_MEDIA_COLS = `${HOME_MEDIA_COLS}, backdrop_url, metadata, tracking_count`;

type ListRow = ListDetailSummary & { profiles: ListDetailAuthor };
type ListItemRow = {
  id: string;
  position: number;
  note: string | null;
  reason: string | null;
  created_at: string | null;
  media_items: ListItemMedia | null;
};

/**
 * A single list + items + author + the viewer's like/save state. Returns null
 * when the list is missing or hidden by RLS (screen → not-found). Keyed by list
 * id; `enabled: !!listId`.
 */
export function useListDetail(listId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: queryKeys.lists.detail(listId ?? "unknown"),
    enabled: !!listId,
    queryFn: async (): Promise<ListDetailData | null> => {
      // (1) The list + author. maybeSingle → null (not an error) when RLS
      // hides it or the id is bogus, so the screen renders a not-found.
      const { data: listData, error: listError } = await supabase
        .from("lists")
        .select(`${LIST_COLS}, ${AUTHOR_EMBED}`)
        .eq("id", listId!)
        .maybeSingle();
      if (listError) throw listError;
      if (!listData) return null;

      const { profiles, ...list } = listData as unknown as ListRow;

      // (2–4) Source media (source lists only), items, and the viewer's
      // like/save — independent, so run them together.
      const [sourceRes, itemsRes, likeRes, saveRes] = await Promise.all([
        list.source_media_id
          ? supabase
              .from("media_items")
              .select(HOME_MEDIA_COLS)
              .eq("id", list.source_media_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        supabase
          .from("list_items")
          .select(
            `id, position, note, reason, created_at, media_items(${ITEM_MEDIA_COLS})`,
          )
          .eq("list_id", listId!)
          .order("position", { ascending: true }),
        user
          ? supabase
              .from("list_likes")
              .select("user_id")
              .eq("user_id", user.id)
              .eq("list_id", listId!)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        user
          ? supabase
              .from("list_saves")
              .select("user_id")
              .eq("user_id", user.id)
              .eq("list_id", listId!)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      if (itemsRes.error) throw itemsRes.error;

      const items: ListDetailItem[] = (
        (itemsRes.data ?? []) as unknown as ListItemRow[]
      ).map((row) => ({
        id: row.id,
        position: row.position,
        note: row.note,
        reason: row.reason,
        createdAt: row.created_at,
        media: row.media_items,
      }));

      return {
        list,
        author: profiles,
        sourceMedia: (sourceRes.data as HomeMediaItem | null) ?? null,
        items,
        viewerLiked: !!likeRes.data,
        viewerSaved: !!saveRes.data,
      };
    },
  });
}

/** Shared shape the toggle mutations optimistically patch on the detail cache. */
type ToggleContext = { previous: ListDetailData | null | undefined };

/**
 * Toggle the viewer's LIKE on a list (mirrors web `toggleListLike`): read for an
 * existing row, delete it (un-like) or insert it (like), logging a `liked_list`
 * activity on the positive transition only. Optimistically flips
 * `viewerLiked` + `like_count` on the detail cache; invalidates the detail +
 * the popular-lists rail (its `like_count` ordering) on settle.
 */
export function useToggleListLikeMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { listId: string; title: string }): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      const { data: existing } = await supabase
        .from("list_likes")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("list_id", vars.listId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("list_likes")
          .delete()
          .eq("user_id", user.id)
          .eq("list_id", vars.listId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("list_likes")
        .insert({ user_id: user.id, list_id: vars.listId });
      if (error) throw error;

      // Positive transition → log the activity (media_id = the list's source, or
      // null). Fire-and-forget; never fails the like.
      const draft = likedListActivity({ listId: vars.listId, title: vars.title });
      const prev = queryClient.getQueryData<ListDetailData | null>(
        queryKeys.lists.detail(vars.listId),
      );
      await logActivity(user.id, prev?.list.source_media_id ?? null, draft);
    },
    onMutate: async (vars): Promise<ToggleContext> => {
      const key = queryKeys.lists.detail(vars.listId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ListDetailData | null>(key);
      if (previous) {
        const nowLiked = !previous.viewerLiked;
        queryClient.setQueryData<ListDetailData>(key, {
          ...previous,
          viewerLiked: nowLiked,
          list: {
            ...previous.list,
            like_count: (previous.list.like_count ?? 0) + (nowLiked ? 1 : -1),
          },
        });
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.lists.detail(vars.listId),
          ctx.previous,
        );
      }
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.lists.detail(vars.listId),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.lists.popular() });
      if (user) {
        void queryClient.invalidateQueries({
          queryKey: [...queryKeys.user.all, user.id],
        });
      }
    },
  });
}

/**
 * Toggle the viewer's SAVE (bookmark) on a list (mirrors web `toggleListSave`).
 * Same read-then-toggle + positive-transition activity log + optimistic patch
 * as {@link useToggleListLikeMutation}, on `viewerSaved` / `saves_count`.
 */
export function useToggleListSaveMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { listId: string; title: string }): Promise<void> => {
      if (!user) throw new Error("Not signed in.");
      const { data: existing } = await supabase
        .from("list_saves")
        .select("user_id")
        .eq("user_id", user.id)
        .eq("list_id", vars.listId)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("list_saves")
          .delete()
          .eq("user_id", user.id)
          .eq("list_id", vars.listId);
        if (error) throw error;
        return;
      }

      const { error } = await supabase
        .from("list_saves")
        .insert({ user_id: user.id, list_id: vars.listId });
      if (error) throw error;

      const draft = savedListActivity({ listId: vars.listId, title: vars.title });
      const prev = queryClient.getQueryData<ListDetailData | null>(
        queryKeys.lists.detail(vars.listId),
      );
      await logActivity(user.id, prev?.list.source_media_id ?? null, draft);
    },
    onMutate: async (vars): Promise<ToggleContext> => {
      const key = queryKeys.lists.detail(vars.listId);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ListDetailData | null>(key);
      if (previous) {
        const nowSaved = !previous.viewerSaved;
        queryClient.setQueryData<ListDetailData>(key, {
          ...previous,
          viewerSaved: nowSaved,
          list: {
            ...previous.list,
            saves_count: (previous.list.saves_count ?? 0) + (nowSaved ? 1 : -1),
          },
        });
      }
      return { previous };
    },
    onError: (_err, vars, ctx) => {
      if (ctx?.previous !== undefined) {
        queryClient.setQueryData(
          queryKeys.lists.detail(vars.listId),
          ctx.previous,
        );
      }
    },
    onSettled: (_data, _err, vars) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.lists.detail(vars.listId),
      });
      if (user) {
        void queryClient.invalidateQueries({
          queryKey: [...queryKeys.user.all, user.id],
        });
      }
    },
  });
}
