import React, { useEffect, useRef } from "react";

const DEFAULT_RESET_MS = 500;

const isEditableTarget = (target) => {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

export default function RfidInputListener({ active = true, onScan, resetMs = DEFAULT_RESET_MS }) {
  const bufferRef = useRef("");
  const timerRef = useRef(null);
  const hiddenInputRef = useRef(null);

  const submitBuffer = (value) => {
    const normalized = String(value || "").trim();
    if (normalized && typeof onScan === "function") {
      onScan(normalized);
    }
  };

  useEffect(() => {
    if (!active) return undefined;

    const focusHiddenInput = () => {
      if (!hiddenInputRef.current) return;
      if (document.activeElement !== hiddenInputRef.current) {
        hiddenInputRef.current.focus({ preventScroll: true });
      }
    };

    focusHiddenInput();

    const handleKeyDown = (event) => {
      if (!active) return;
      const key = event.key || "";

      if (isEditableTarget(event.target) && event.target !== hiddenInputRef.current) {
        return;
      }

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      if (key === "Enter" || key === "Tab") {
        event.preventDefault();
        submitBuffer(bufferRef.current);
        bufferRef.current = "";
        if (hiddenInputRef.current) hiddenInputRef.current.value = "";
        return;
      }

      if (key.length === 1) {
        bufferRef.current += key;
      }

      timerRef.current = window.setTimeout(() => {
        bufferRef.current = "";
        if (hiddenInputRef.current) hiddenInputRef.current.value = "";
      }, resetMs);
    };

    const handleVisibility = () => {
      if (!document.hidden) {
        focusHiddenInput();
      }
    };

    const handleInput = (event) => {
      const rawValue = event.target?.value || "";
      if (/[\n\r\t]/.test(rawValue)) {
        const cleaned = rawValue.replace(/[\n\r\t]+/g, "");
        submitBuffer(cleaned);
        bufferRef.current = "";
        event.target.value = "";
        return;
      }

      bufferRef.current = rawValue;
    };

    window.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [active, onScan, resetMs]);

  if (!active) return null;

  return (
    <input
      ref={hiddenInputRef}
      type="text"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      aria-hidden="true"
      tabIndex={-1}
      inputMode="none"
      onInput={handleInput}
      onBlur={() => {
        if (active) {
          setTimeout(() => hiddenInputRef.current?.focus({ preventScroll: true }), 0);
        }
      }}
      style={{
        position: "fixed",
        opacity: 0,
        pointerEvents: "none",
        width: 1,
        height: 1,
        left: -9999,
        top: "40%",
      }}
    />
  );
}
