"use client";

import { useState } from "react";
import { X } from "lucide-react";

/**
 * Free-text tag input. Type, press Enter to commit. The current input
 * shows below as a dashed-border preview badge so the user can see what
 * they're about to commit; Enter promotes it to a solid badge with an
 * X to remove. Backspace on an empty input pops the last tag.
 *
 * Tags are lowercased and de-duped on commit.
 */
export default function TagInput({
  tags,
  onChange,
  maxTags = 10,
  maxTagLength = 40,
  placeholder = "Type a tag and press Enter…",
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  maxTags?: number;
  maxTagLength?: number;
  placeholder?: string;
}) {
  const [input, setInput] = useState("");

  const previewTag = input.trim().toLowerCase();
  const previewVisible =
    previewTag.length > 0 &&
    previewTag.length <= maxTagLength &&
    !tags.includes(previewTag);

  function commit() {
    if (!previewVisible) return;
    if (tags.length >= maxTags) return;
    onChange([...tags, previewTag]);
    setInput("");
  }

  function remove(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (
      e.key === "Backspace" &&
      input.length === 0 &&
      tags.length > 0
    ) {
      // Backspace on an empty input removes the last tag — common
      // pattern in tag inputs (Twitter, Slack, etc.).
      onChange(tags.slice(0, -1));
    }
  }

  const atLimit = tags.length >= maxTags;

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
        placeholder={atLimit ? `Max ${maxTags} tags` : placeholder}
        disabled={atLimit}
        className="w-full rounded-sm border border-surface-border bg-surface-overlay px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-brand focus:outline-none disabled:opacity-50"
      />

      {(tags.length > 0 || previewVisible) && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="flex items-center gap-1.5 rounded-sm bg-brand/10 px-2 py-1 text-xs text-brand"
            >
              {tag}
              <button
                type="button"
                onClick={() => remove(tag)}
                aria-label={`Remove tag ${tag}`}
                className="rounded-sm transition-colors hover:bg-brand/20"
              >
                <X size={10} />
              </button>
            </span>
          ))}
          {previewVisible && (
            <span className="rounded-sm border border-dashed border-text-muted/40 px-2 py-1 text-xs text-text-muted">
              {previewTag}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
