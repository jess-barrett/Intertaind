"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

async function getAuthUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Unauthorized");
  return { supabase, user };
}

const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,30}$/;

/**
 * Create the profiles row for an OAuth user after they pick a username.
 * Called from /auth/setup-username. Errors if a profile already exists for
 * this user, so OAuth sign-ins that land here by accident can't overwrite
 * their existing profile.
 */
export async function createInitialProfile(username: string): Promise<void> {
  const { supabase, user } = await getAuthUser();

  const name = username.trim();
  if (!USERNAME_REGEX.test(name)) {
    throw new Error(
      "Username must be 3–30 chars: letters, numbers, underscore, or dash."
    );
  }

  // Refuse if a profile row already exists
  const { data: existingForUser } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", user.id)
    .maybeSingle();
  if (existingForUser) {
    throw new Error("Profile already set up.");
  }

  // Uniqueness check (case-insensitive)
  const { data: taken } = await supabase
    .from("profiles")
    .select("id")
    .ilike("username", name)
    .maybeSingle();
  if (taken) throw new Error("Username is already taken.");

  const { error } = await supabase
    .from("profiles")
    .insert({ id: user.id, username: name });
  if (error) throw new Error(`Failed to create profile: ${error.message}`);

  // Keep auth.users.user_metadata.username in sync
  await supabase.auth.updateUser({ data: { username: name } });
}

export async function updateProfile(input: {
  username?: string;
  display_name?: string | null;
  bio?: string | null;
  is_private?: boolean;
}): Promise<{ username: string }> {
  const { supabase, user } = await getAuthUser();

  const updates: Record<string, unknown> = {};

  if (input.username !== undefined) {
    const username = input.username.trim();
    if (!USERNAME_REGEX.test(username)) {
      throw new Error(
        "Username must be 3–30 chars: letters, numbers, underscore, or dash."
      );
    }
    // Check uniqueness (case-insensitive) — only if changing
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .ilike("username", username)
      .neq("id", user.id)
      .maybeSingle();
    if (existing) throw new Error("Username is already taken.");
    updates.username = username;
  }

  if (input.display_name !== undefined) {
    const dn = input.display_name?.trim() || null;
    if (dn && dn.length > 50) throw new Error("Display name too long (max 50).");
    updates.display_name = dn;
  }

  if (input.bio !== undefined) {
    const bio = input.bio?.trim() || null;
    if (bio && bio.length > 500) throw new Error("Bio too long (max 500).");
    updates.bio = bio;
  }

  if (input.is_private !== undefined) {
    updates.is_private = input.is_private;
  }

  if (Object.keys(updates).length === 0) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();
    return { username: data?.username ?? "" };
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select("username")
    .single();

  if (error) throw new Error(`Failed to update profile: ${error.message}`);

  // Keep auth.users.user_metadata.username in sync with profiles.username so
  // the nav menu (which reads user_metadata) reflects the new value.
  if (updates.username) {
    await supabase.auth.updateUser({
      data: { username: updates.username },
    });
  }

  revalidatePath("/settings");
  revalidatePath(`/u/${data.username}`);
  return { username: data.username };
}

/**
 * Upload a new avatar image to the `avatars` bucket and update the user's
 * profile row with its public URL. Path convention: `{user_id}/avatar.{ext}`
 * so old files are overwritten on re-upload.
 */
export async function uploadAvatar(formData: FormData): Promise<string> {
  const { supabase, user } = await getAuthUser();

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided.");
  if (file.size > 5 * 1024 * 1024) throw new Error("File too large (max 5 MB).");
  if (!file.type.startsWith("image/"))
    throw new Error("Only image files are allowed.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${user.id}/avatar.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);

  // Cache-bust so the browser picks up the new image immediately
  const url = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ avatar_url: url })
    .eq("id", user.id);

  if (updateError)
    throw new Error(`Failed to save avatar: ${updateError.message}`);

  revalidatePath("/settings");
  return url;
}

export async function removeAvatar(): Promise<void> {
  const { supabase, user } = await getAuthUser();

  // Best-effort delete of any uploaded files for this user. Ignore errors —
  // the bucket may be empty or files may have been cleared already.
  const { data: files } = await supabase.storage.from("avatars").list(user.id);
  if (files && files.length > 0) {
    await supabase.storage
      .from("avatars")
      .remove(files.map((f) => `${user.id}/${f.name}`));
  }

  const { error } = await supabase
    .from("profiles")
    .update({ avatar_url: null })
    .eq("id", user.id);
  if (error) throw new Error(`Failed to clear avatar: ${error.message}`);

  revalidatePath("/settings");
}

export async function updateEmail(newEmail: string): Promise<void> {
  const { supabase } = await getAuthUser();
  const email = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Invalid email address.");

  const { error } = await supabase.auth.updateUser({ email });
  if (error) throw new Error(error.message);
  // Supabase sends a confirmation email; the change isn't effective until
  // the user clicks the link in it.
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { supabase } = await getAuthUser();
  if (newPassword.length < 8)
    throw new Error("Password must be at least 8 characters.");

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(error.message);
}
