/**
 * ProfileView — the ONE shared component behind both profile entry points: the
 * viewer's own `(profile)` tab (passes `userId` from `useAuth`) and anyone
 * else's `u/[username]` route (passes `username`, plus `showBack`). It resolves
 * the `profiles` row, derives `profileUserId` + `isOwner`, and renders the
 * header + an in-screen segmented control (Profile · Shelves · Recs · Lists)
 * whose body swaps with the active segment (the "Profile" segment is the
 * OverviewTab). Mirrors web's `/u/[username]`.
 *
 * ── States ──────────────────────────────────────────────────────────────
 *   - pending → a centered spinner.
 *   - null → "Profile not found". A row missing because RLS hides a private
 *     profile is indistinguishable from a genuinely missing one (both return
 *     no row), so both land here.
 *   - loaded but `is_private && !isOwner` → the "This profile is private"
 *     empty state (we DID get the row — e.g. it's the owner's own).
 *   - error → "Couldn't load this profile."
 *   - else → header + segmented control + the active segment's body.
 *
 * ── Segment scope ─────────────────────────────────────────────────────────
 * Overview (M2) and Shelves (M3) are live; Recs (M4) and Lists (M5) are still
 * "… coming soon" stubs, each self-fetching by `profileUserId`. Follow
 * mutations are M6 (the header's Follow button is a visual placeholder). No
 * settings screen yet (the header gear no-ops).
 *
 * ── Private-profile deferral (per the plan) ─────────────────────────────
 * If `profile.is_private && !isOwner` we render a private empty state; we do
 * NOT attempt follower-peek or block filtering (not DB-enforced; web-only).
 *
 * ── Layout ──────────────────────────────────────────────────────────────
 * A single `ScrollView`. As a headerless tab anchor (the `(profile)` tab) it
 * reserves the TOP safe-area itself; pushed into a tab stack (`u/[username]`)
 * the tab's Stack still hides headers, so `showBack` renders a translucent back
 * pill (the SAME affordance as media detail's `BackPill`). The bottom inset
 * clears the persistent navbar (see apps/mobile/AGENTS.md).
 *
 * Sign out (owner): kept reachable at the bottom of the Overview segment for
 * the owner, since there's no settings screen for the header gear yet — the
 * action must not be lost. Moves into settings when that surface lands.
 */
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { colors } from "@intertaind/design-system";

import { useAuth } from "@/components/auth-provider";
import { ListsTab } from "@/components/profile/lists-tab";
import { OverviewTab } from "@/components/profile/overview-tab";
import { ProfileHeader } from "@/components/profile/profile-header";
import { RecommendationsTab } from "@/components/profile/recommendations-tab";
import { SegmentedControl } from "@/components/profile/segmented-control";
import { ShelvesTab } from "@/components/profile/shelves-tab";
import { UserSearchBar } from "@/components/profile/user-search-bar";
import { useBottomInset } from "@/lib/use-bottom-inset";
import { useProfile, useProfileMediaCounts } from "@/queries/profile";
import { useSignOutMutation } from "@/queries/auth";

/** The four in-screen segments (order = display order). */
const SEGMENTS = ["Profile", "Shelves", "Recs", "Lists"] as const;
type Segment = (typeof SEGMENTS)[number];

export function ProfileView({
  userId,
  username,
  showBack = false,
}: {
  /** Resolve the profile BY id — the `(profile)` tab (viewer's own id). */
  userId?: string;
  /** Resolve the profile BY username — the shared `u/[username]` route. */
  username?: string;
  /** Render the back pill — set by the pushed `u/[username]` route (the tab
   *  anchor is a root tab with no back, so it leaves this false). */
  showBack?: boolean;
}) {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const bottomInset = useBottomInset();

  const profileQuery = useProfile({ userId, username });
  const profile = profileQuery.data;
  const profileUserId = profile?.id;
  const isOwner = !!user && !!profile && user.id === profile.id;

  // Counts read is keyed by the RESOLVED profile owner id; enabled gate inside
  // the hook keeps it dormant until the profile resolves.
  const countsQuery = useProfileMediaCounts(profileUserId);

  const [segment, setSegment] = useState<Segment>("Profile");
  // The "find users" bar (user+ toggle → full-width user search). Lives in the
  // top row beside the primary tabs; open swaps the tabs for the search field.
  const [userSearchOpen, setUserSearchOpen] = useState(false);

  // ── Pending ──────────────────────────────────────────────────────────
  if (profileQuery.isPending) {
    return (
      <ProfileShell showBack={showBack} topInset={insets.top}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors["text-muted"]} />
        </View>
      </ProfileShell>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────
  if (profileQuery.error) {
    return (
      <ProfileShell showBack={showBack} topInset={insets.top}>
        <EmptyState
          title="Couldn't load this profile."
          detail="Check your connection and try again."
        />
      </ProfileShell>
    );
  }

  // ── Not found (null: genuinely missing, or RLS-hidden) ─────────────────
  if (!profile) {
    return (
      <ProfileShell showBack={showBack} topInset={insets.top}>
        <EmptyState title="Profile not found" />
      </ProfileShell>
    );
  }

  // ── Private (row visible only because RLS let it through when owned) ────
  if (profile.is_private && !isOwner) {
    return (
      <ProfileShell showBack={showBack} topInset={insets.top}>
        <EmptyState
          title="This profile is private"
          detail="Follow to see their activity, shelves, and lists."
        />
      </ProfileShell>
    );
  }

  // ── Resolved ───────────────────────────────────────────────────────────
  return (
    <ProfileShell showBack={showBack} topInset={insets.top}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        // Primary tabs sit at the very top; when a back pill floats there too
        // (u/[username]), pad the content down so the tabs clear it.
        contentContainerStyle={{
          paddingTop: showBack ? 44 : 8,
          paddingBottom: 32 + bottomInset,
        }}
      >
        {/* Primary tabs ABOVE the profile info — the header then separates them
            from any sub-nav a segment renders (e.g. Shelves' type/status bars),
            so the page never reads as a stack of near-identical bars. */}
        <View className="px-4 pb-4">
          <SegmentedControl
            options={SEGMENTS}
            value={segment}
            onChange={setSegment}
          />
        </View>

        <ProfileHeader
          profile={profile}
          counts={countsQuery.data}
          isOwner={isOwner}
          onFindUsers={() => setUserSearchOpen(true)}
        />

        {/* Active segment body. Overview (M2) + Shelves (M3) + Recs (M4) +
            Lists (M5) are live; each self-fetches by `profileUserId`. */}
        <View className="px-4 pt-6">
          <SegmentBody
            segment={segment}
            profileUserId={profile.id}
            username={profile.username}
            isOwner={isOwner}
          />
        </View>
      </ScrollView>

      {/* Find-users overlay — a floating, connected dropdown pinned over the
          TOP of the page (absolute, so it never shifts the scroll content).
          A transparent full-screen catcher closes it on an outside tap. */}
      {userSearchOpen ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close user search"
            style={StyleSheet.absoluteFill}
            onPress={() => setUserSearchOpen(false)}
          />
          <View
            style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16 }}
          >
            <UserSearchBar onClose={() => setUserSearchOpen(false)} />
          </View>
        </View>
      ) : null}
    </ProfileShell>
  );
}

/**
 * The outer frame every state shares: the page background, the top safe-area
 * reservation (headerless), and — when `showBack` — the floating back pill.
 */
function ProfileShell({
  children,
  showBack,
  topInset,
}: {
  children: React.ReactNode;
  showBack: boolean;
  topInset: number;
}) {
  return (
    <View
      className="flex-1 bg-surface-default"
      style={{ paddingTop: topInset }}
    >
      {children}
      {showBack ? <FloatingBackButton topInset={topInset} /> : null}
    </View>
  );
}

/**
 * A translucent circular back button at the top-left — the SAME affordance
 * media detail uses (media/[id].tsx `BackPill`/`FloatingBackButton`), reused
 * here for the pushed `u/[username]` route (the tab Stack hides headers).
 */
function FloatingBackButton({ topInset }: { topInset: number }) {
  const router = useRouter();
  return (
    <View
      pointerEvents="box-none"
      style={{ position: "absolute", top: topInset + 6, left: 12 }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        hitSlop={8}
        className="h-9 w-9 items-center justify-center rounded-full active:opacity-70"
        style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
        onPress={() => router.back()}
      >
        <ArrowLeft size={22} color={colors["text-primary"]} />
      </Pressable>
    </View>
  );
}

/** A centered title + optional detail — the not-found / private / error body. */
function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <View className="flex-1 items-center justify-center gap-2 px-8">
      <Text className="text-center text-base font-semibold text-text-primary">
        {title}
      </Text>
      {detail ? (
        <Text className="text-center text-sm text-text-muted">{detail}</Text>
      ) : null}
    </View>
  );
}

/**
 * The active segment's body. Overview (M2) is the real `OverviewTab`; Shelves
 * (M3) is the real `ShelvesTab`; Recs (M4) is the real `RecommendationsTab`;
 * Lists (M5) is the real `ListsTab` (created lists only). Every segment is now
 * live — each self-fetches by `profileUserId`. For the OWNER, the Overview
 * segment ALSO hosts the Sign out affordance beneath the tab (there's no
 * settings surface yet for the header gear, so the action mustn't be lost).
 */
function SegmentBody({
  segment,
  profileUserId,
  username,
  isOwner,
}: {
  segment: Segment;
  /** The resolved profile owner's id — every segment self-fetches by it. */
  profileUserId: string;
  /** The resolved profile's username — Overview builds its See-all routes with it. */
  username: string;
  isOwner: boolean;
}) {
  if (segment === "Profile") {
    return (
      <View className="gap-6">
        <OverviewTab
          userId={profileUserId}
          username={username}
          isOwner={isOwner}
        />
        {/* Owner-only, kept reachable until a settings surface lands. */}
        {isOwner ? <SignOutButton /> : null}
      </View>
    );
  }

  if (segment === "Shelves") {
    return <ShelvesTab userId={profileUserId} isOwner={isOwner} />;
  }

  if (segment === "Recs") {
    return <RecommendationsTab userId={profileUserId} />;
  }

  if (segment === "Lists") {
    return <ListsTab userId={profileUserId} isOwner={isOwner} />;
  }

  // Defensive default — every segment above is live; this only guards an
  // unreachable segment value (a future SEGMENTS addition before its branch).
  return (
    <View className="gap-6">
      <Text className="text-center text-sm text-text-muted">
        {segment} coming soon
      </Text>
    </View>
  );
}

/**
 * Sign out — the owner-only affordance, kept reachable here until the settings
 * surface lands. On success `onAuthStateChange` clears the session and the root
 * gating redirects to login; the screen never navigates itself.
 */
function SignOutButton() {
  const signOut = useSignOutMutation();
  return (
    <View className="gap-2">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Sign out"
        className="items-center rounded-lg border border-surface-border px-4 py-3 active:opacity-70"
        onPress={() => signOut.mutate()}
        disabled={signOut.isPending}
      >
        {signOut.isPending ? (
          <ActivityIndicator color={colors["text-primary"]} />
        ) : (
          <Text className="font-semibold text-text-secondary">Sign out</Text>
        )}
      </Pressable>
      {signOut.error ? (
        <Text className="text-center text-sm text-text-muted">
          {signOut.error.message}
        </Text>
      ) : null}
    </View>
  );
}
