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

  useEffect(() => {
    if (!active) return undefined;

    const handleKeyDown = (event) => {
      if (!active) return;
      if (isEditableTarget(event.target)) return;

      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }

      if (event.key === "Enter") {
        const value = bufferRef.current;
        bufferRef.current = "";
        if (value && typeof onScan === "function") {
          onScan(value);
        }
        return;
      }

      if (event.key.length === 1) {
        bufferRef.current += event.key;
      }

      timerRef.current = window.setTimeout(() => {
        bufferRef.current = "";
      }, resetMs);
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [active, onScan, resetMs]);

  return null;
}
