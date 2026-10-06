"use client";

import { useState, type KeyboardEvent, type ReactNode } from "react";

export function Field({
  label,
  hint,
  error,
  optional,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  optional?: boolean;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {optional && <span className="optional">任意</span>}
      </label>
      {hint && <div className="field-hint">{hint}</div>}
      {children}
      {error && <div className="field-error">{error}</div>}
    </div>
  );
}

/** Free-form tag list with optional one-click suggestions. */
export function TagInput({
  value,
  onChange,
  placeholder,
  suggestions = [],
  max = 20,
  id,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  max?: number;
  id?: string;
}) {
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const items = raw
      .split(/[,、\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const next = [...value];
    for (const item of items) if (!next.includes(item) && next.length < max) next.push(item);
    onChange(next);
    setDraft("");
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === "Enter" || e.key === ",") && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (draft.trim()) add(draft);
    } else if (e.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  const remaining = suggestions.filter((s) => !value.includes(s));
  return (
    <>
      <div className="tag-input">
        {value.map((tag) => (
          <span className="tag-chip" key={tag}>
            {tag}
            <button type="button" aria-label={`${tag}を削除`} onClick={() => onChange(value.filter((t) => t !== tag))}>
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          placeholder={value.length ? "" : placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && add(draft)}
        />
      </div>
      {remaining.length > 0 && (
        <div className="suggestions">
          {remaining.map((s) => (
            <button type="button" className="suggestion" key={s} onClick={() => add(s)}>
              ＋ {s}
            </button>
          ))}
        </div>
      )}
    </>
  );
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="chip-options" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          role="radio"
          aria-checked={o.value === value}
          key={o.value}
          className={`choice-chip ${o.value === value ? "selected" : ""}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
