"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Trash2, Lock, Globe, Loader2 } from "lucide-react";
import type { Profile } from "@/lib/types";
import {
  updateProfile,
  uploadAvatar,
  removeAvatar,
  updateEmail,
  updatePassword,
} from "@/app/actions/profile";

export default function SettingsForm({
  profile,
  email,
}: {
  profile: Profile;
  email: string;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url);
  const [username, setUsername] = useState(profile.username);
  const [displayName, setDisplayName] = useState(profile.display_name ?? "");
  const [bio, setBio] = useState(profile.bio ?? "");
  const [isPrivate, setIsPrivate] = useState(profile.is_private);

  const [emailInput, setEmailInput] = useState(email);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [emailMsg, setEmailMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [passwordMsg, setPasswordMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [avatarMsg, setAvatarMsg] = useState<string | null>(null);

  const [saving, startProfile] = useTransition();
  const [savingEmail, startEmail] = useTransition();
  const [savingPassword, startPassword] = useTransition();
  const [uploading, startUpload] = useTransition();

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarMsg(null);
    startUpload(async () => {
      try {
        const fd = new FormData();
        fd.append("file", file);
        const url = await uploadAvatar(fd);
        setAvatarUrl(url);
        router.refresh();
      } catch (err) {
        setAvatarMsg(err instanceof Error ? err.message : "Upload failed.");
      }
    });
  }

  function handleRemoveAvatar() {
    setAvatarMsg(null);
    startUpload(async () => {
      try {
        await removeAvatar();
        setAvatarUrl(null);
        router.refresh();
      } catch (err) {
        setAvatarMsg(err instanceof Error ? err.message : "Failed to remove.");
      }
    });
  }

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    setProfileMsg(null);
    startProfile(async () => {
      try {
        const { username: newUsername } = await updateProfile({
          username,
          display_name: displayName,
          bio,
          is_private: isPrivate,
        });
        setProfileMsg({ ok: true, text: "Profile updated." });
        if (newUsername !== profile.username) {
          router.refresh();
        }
      } catch (err) {
        setProfileMsg({
          ok: false,
          text: err instanceof Error ? err.message : "Update failed.",
        });
      }
    });
  }

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    setEmailMsg(null);
    startEmail(async () => {
      try {
        await updateEmail(emailInput);
        setEmailMsg({
          ok: true,
          text: "Check your new email to confirm the change.",
        });
      } catch (err) {
        setEmailMsg({
          ok: false,
          text: err instanceof Error ? err.message : "Update failed.",
        });
      }
    });
  }

  function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ ok: false, text: "Passwords don't match." });
      return;
    }
    startPassword(async () => {
      try {
        await updatePassword(newPassword);
        setNewPassword("");
        setConfirmPassword("");
        setPasswordMsg({ ok: true, text: "Password updated." });
      } catch (err) {
        setPasswordMsg({
          ok: false,
          text: err instanceof Error ? err.message : "Update failed.",
        });
      }
    });
  }

  const joinedDate = new Date(profile.created_at).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="flex flex-col gap-10">
      {/* Avatar */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
          Avatar
        </h2>
        <div className="flex items-center gap-5">
          <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-overlay text-2xl font-bold text-brand">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={profile.username}
                className="h-full w-full object-cover"
              />
            ) : (
              profile.username[0].toUpperCase()
            )}
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-2 rounded-lg border border-surface-border bg-surface-raised px-3 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
              >
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                Upload
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploading}
                  className="flex items-center gap-2 rounded-lg border border-surface-border px-3 py-2 text-sm text-text-muted transition-colors hover:text-text-primary disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted">PNG or JPG, up to 5 MB.</p>
            {avatarMsg && (
              <p className="text-xs text-accent-movie">{avatarMsg}</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
        </div>
      </section>

      {/* Profile */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
          Profile
        </h2>
        <form onSubmit={handleProfileSubmit} className="flex flex-col gap-4">
          <Field label="Username" hint="3–30 chars: letters, numbers, _ or -">
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              required
            />
          </Field>
          <Field label="Display name">
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={50}
              className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
              placeholder={profile.username}
            />
          </Field>
          <Field label="Bio" hint={`${bio.length}/500`}>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              maxLength={500}
              rows={3}
              className="w-full resize-none rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-surface-border p-3 transition-colors hover:bg-surface-overlay">
            <input
              type="checkbox"
              checked={isPrivate}
              onChange={(e) => setIsPrivate(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                {isPrivate ? <Lock size={14} /> : <Globe size={14} />}
                Private profile
              </div>
              <p className="mt-0.5 text-xs text-text-muted">
                When enabled, only you can see your shelves, activity, and
                lists.
              </p>
            </div>
          </label>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-dark disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {profileMsg && (
              <p
                className={`text-xs ${
                  profileMsg.ok ? "text-accent-book" : "text-accent-movie"
                }`}
              >
                {profileMsg.text}
              </p>
            )}
          </div>
        </form>
      </section>

      {/* Account */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-muted">
          Account
        </h2>
        <div className="flex flex-col gap-6">
          <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
            <Field label="Email">
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
                required
              />
            </Field>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingEmail || emailInput === email}
                className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
              >
                {savingEmail ? "Sending…" : "Update email"}
              </button>
              {emailMsg && (
                <p
                  className={`text-xs ${
                    emailMsg.ok ? "text-accent-book" : "text-accent-movie"
                  }`}
                >
                  {emailMsg.text}
                </p>
              )}
            </div>
          </form>

          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
            <Field label="New password" hint="At least 8 characters">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
                minLength={8}
                required
              />
            </Field>
            <Field label="Confirm password">
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-surface-border bg-surface-overlay px-4 py-2.5 text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none"
                minLength={8}
                required
              />
            </Field>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={savingPassword || !newPassword}
                className="rounded-lg border border-surface-border bg-surface-raised px-4 py-2 text-sm text-text-primary transition-colors hover:bg-surface-overlay disabled:opacity-50"
              >
                {savingPassword ? "Saving…" : "Change password"}
              </button>
              {passwordMsg && (
                <p
                  className={`text-xs ${
                    passwordMsg.ok ? "text-accent-book" : "text-accent-movie"
                  }`}
                >
                  {passwordMsg.text}
                </p>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Joined */}
      <section className="text-xs text-text-muted">
        Joined {joinedDate}
      </section>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-text-secondary">{label}</label>
        {hint && <span className="text-xs text-text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
