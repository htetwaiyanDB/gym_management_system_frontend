import React, { useEffect, useRef } from "react";

const DEFAULT_RESET_MS = 500;

const isEditableTarget = (target) => {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

export default function RfidInputListener({
  active = true,
  onScan,
  resetMs = DEFAULT_RESET_MS,
  submitOnIdle = true,
  minLength = 4,
  captureOnEditable = false,
}) {
  const bufferRef = useRef("");
  const timerRef = useRef(null);

  useEffect(() => {
    if (!active) return undefined;

    const flushBuffer = () => {
      const value = bufferRef.current.trim();
      bufferRef.current = "";
      if (value.length >= minLength && typeof onScan === "function") {
        onScan(value);
      }
    };

    const resetTimer = () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      timerRef.current = window.setTimeout(() => {
        if (submitOnIdle) {
          flushBuffer();
        } else {
          bufferRef.current = "";
        }
      }, resetMs);
    };

    const handleKeyDown = (event) => {
      if (!active) return;
      if (!captureOnEditable && isEditableTarget(event.target)) return;

      if (event.key === "Enter") {
        flushBuffer();
        return;
      }

      if (event.key.length === 1) {
        bufferRef.current += event.key;
        resetTimer();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [active, captureOnEditable, minLength, onScan, resetMs, submitOnIdle]);

  return null;
}
