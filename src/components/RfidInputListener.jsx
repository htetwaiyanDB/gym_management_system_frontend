import React, { useEffect, useRef, useCallback } from "react";

const DEFAULT_RESET_MS = 500;

const isEditableTarget = (target) => {
  if (!target) return false;
  const tag = String(target.tagName || "").toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable;
};

// Function to request focus on the document body to capture key events in mobile environments
const ensureFocus = () => {
  // In some mobile web environments, key events are only captured when an element has focus
  // We'll try to ensure the body or a hidden element has focus
  if (document.activeElement !== document.body) {
    document.body.focus();
  }
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
  const isFocusedRef = useRef(false);

  const flushBuffer = useCallback(() => {
    const value = bufferRef.current.trim();
    bufferRef.current = "";
    if (value.length >= minLength && typeof onScan === "function") {
      onScan(value);
    }
  }, [minLength, onScan]);

  const resetTimer = useCallback(() => {
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
  }, [resetMs, submitOnIdle, flushBuffer]);

  const handleKeyDown = useCallback((event) => {
    if (!active) return;
    if (!captureOnEditable && isEditableTarget(event.target)) return;

    // Ensure we have focus to capture events in mobile environments
    if (!isFocusedRef.current) {
      isFocusedRef.current = true;
      ensureFocus();
    }

    if (event.key === "Enter") {
      flushBuffer();
      return;
    }

    if (event.key.length === 1) {
      bufferRef.current += event.key;
      resetTimer();
    }
  }, [active, captureOnEditable, flushBuffer, resetTimer]);

  useEffect(() => {
    if (!active) return undefined;

    // Add passive event listeners with proper options for mobile compatibility
    window.addEventListener("keydown", handleKeyDown, { capture: true, passive: false });
    
    // Attempt to ensure focus periodically in mobile environments
    const focusInterval = setInterval(ensureFocus, 1000);
    
    // Also listen for visibility changes which can affect focus in mobile apps
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && active) {
        setTimeout(ensureFocus, 100);
      }
    };
    
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true, passive: false });
      clearInterval(focusInterval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [active, handleKeyDown]);

  return null;
}
