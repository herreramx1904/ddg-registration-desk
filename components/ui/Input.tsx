"use client";

import { useId, useRef, type InputHTMLAttributes, type ReactNode, type Ref } from "react";
import { cx } from "./cx";
import { IconClose, IconSearch } from "./icons";

const fieldBase =
  "block w-full min-w-0 rounded-lg border border-ddg-line bg-white text-ddg-ink placeholder:text-ddg-muted/70 " +
  "transition-[border-color,box-shadow] duration-150 outline-none " +
  "focus-visible:outline-none focus:border-ddg-orange focus:shadow-[0_0_0_3px_rgb(251_119_48/0.18)] " +
  "disabled:bg-ddg-soft disabled:opacity-60";

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label?: ReactNode;
  /** Help text under the field. */
  hint?: ReactNode;
  /** Error text under the field; also marks the field invalid. */
  error?: ReactNode;
  /** "sm" = 40px (manager pages). Default "lg" = 56px (desk). */
  size?: "sm" | "lg";
  ref?: Ref<HTMLInputElement>;
  /** Class for the outer wrapper. */
  wrapperClassName?: string;
}

/** Text input with optional label, hint and error. */
export function Input({ label, hint, error, size = "lg", id, className, wrapperClassName, ref, ...rest }: InputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const msgId = `${inputId}-msg`;
  const sm = size === "sm";
  return (
    <div className={cx("flex flex-col", sm ? "gap-1" : "gap-1.5", wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className={cx("text-ddg-ink", sm ? "text-xs font-semibold" : "text-sm")}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? msgId : undefined}
        className={cx(
          fieldBase,
          sm ? "h-10 px-3 text-sm" : "h-14 px-4 text-lg",
          !!error && "border-danger focus:border-danger",
          className,
        )}
        {...rest}
      />
      {(error || hint) && (
        <p id={msgId} className={cx(sm ? "text-xs" : "text-sm", error ? "text-danger-strong" : "text-ddg-muted")}>
          {error || hint}
        </p>
      )}
    </div>
  );
}

export interface SearchInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "value" | "onChange" | "type"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Called after the clear button empties the field. */
  onClear?: () => void;
  /** Accessible label (visually hidden). Default "Search guests". */
  label?: string;
  /** "sm" = 40px (manager pages). Default "lg" = 64px (desk). */
  size?: "sm" | "lg";
  ref?: Ref<HTMLInputElement>;
  /** Extra element inside the right edge, e.g. a QR button. */
  trailing?: ReactNode;
  wrapperClassName?: string;
}

/**
 * Search field with icon and clear button. Controlled.
 * Works with USB barcode scanners (they type + Enter): handle Enter via onKeyDown or wrap in a <form>.
 */
export function SearchInput({
  value,
  onValueChange,
  onClear,
  label = "Search guests",
  placeholder = "Search name or company",
  size = "lg",
  ref,
  trailing,
  className,
  wrapperClassName,
  ...rest
}: SearchInputProps) {
  const innerRef = useRef<HTMLInputElement | null>(null);
  const sm = size === "sm";
  const setRefs = (el: HTMLInputElement | null) => {
    innerRef.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as { current: HTMLInputElement | null }).current = el;
  };
  return (
    <div className={cx("relative", wrapperClassName)}>
      <span
        className={cx(
          "pointer-events-none absolute top-1/2 -translate-y-1/2",
          sm ? "left-2.5 text-ddg-muted" : "left-4 text-ddg-orange",
        )}
      >
        <IconSearch size={sm ? 16 : 24} />
      </span>
      <input
        ref={setRefs}
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className={cx(
          fieldBase,
          "[&::-webkit-search-cancel-button]:hidden",
          sm ? "h-10 pl-8 text-sm" : "h-16 pl-13 text-xl",
          sm ? (trailing ? "pr-20" : "pr-9") : trailing ? "pr-28" : "pr-14",
          className,
        )}
        {...rest}
      />
      <div className={cx("absolute top-1/2 flex -translate-y-1/2 items-center gap-1", sm ? "right-1" : "right-2")}>
        {value && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => {
              onValueChange("");
              onClear?.();
              innerRef.current?.focus();
            }}
            className={cx(
              "grid place-items-center rounded-md text-ddg-muted hover:bg-ddg-soft hover:text-ddg-ink",
              sm ? "size-7" : "size-11",
            )}
          >
            <IconClose size={sm ? 16 : 22} />
          </button>
        )}
        {trailing}
      </div>
    </div>
  );
}
