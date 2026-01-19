import React, { useEffect, useMemo, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import axiosClient from "../../api/axiosClient";

/**
 * Optional helper:
 * If your QR contains token as plain text => token is decodedText
 * If your QR is JSON => {"token":"...","type":"trainer"}
 * If your QR is URL => https://x.com/?token=...
 */
function parseTokenFromQrText(decodedText) {
  if (!decodedText) return null;

  // Try JSON
  try {
    const obj = JSON.parse(decodedText);
    if (obj?.token) return { token: String(obj.token), type: obj?.type ? String(obj.type) : null };
  } catch {
    // ignore
  }

  // Try URL
  try {
    const url = new URL(decodedText);
    const token = url.searchParams.get("token");
    const type = url.searchParams.get("type");
    if (token) return { token: String(token), type: type ? String(type) : null };
  } catch {
    // ignore
  }

  // Plain token
  return { token: String(decodedText).trim(), type: null };
}

export default function QrScanner({
  role = "trainer", // "trainer" | "user"
  onDecode, // optional custom handler: async (decodedText) => {}
  cooldownMs = 1200,
}) {
  const [msg, setMsg] = useState(null);

  // Fix A: StrictMode double-mount guard
  const initializedRef = useRef(false);

  // Holds scanner instance
  const scannerRef = useRef(null);

  // Prevent processing multiple scans at once
  const busyRef = useRef(false);

  // Unique DOM id for this component instance
  const readerId = useMemo(
    () => `qr-reader-${Math.random().toString(36).slice(2)}`,
    []
  );

  useEffect(() => {
    // ✅ Fix A: prevent double initialization (React18 StrictMode in dev)
    if (initializedRef.current) return;
    initializedRef.current = true;

    let cancelled = false;

    const getQrBox = () => {
      const el = document.getElementById(readerId);
      const w = el?.clientWidth || 320;
      const size = Math.max(180, Math.min(280, Math.floor(w * 0.8)));
      return { width: size, height: size };
    };

    const scanner = new Html5QrcodeScanner(
      readerId,
      {
        fps: 10,
        qrbox: getQrBox,
        rememberLastUsedCamera: true,
      },
      false
    );

    scannerRef.current = scanner;

    const handleScanSuccess = async (decodedText) => {
      if (cancelled) return;
      if (busyRef.current) return;

      busyRef.current = true;
      setMsg(null);

      try {
        // Pause scanning while processing (prevents rapid duplicate triggers)
        scanner.pause(true);

        // If parent wants to handle scanning itself
        if (typeof onDecode === "function") {
          await onDecode(decodedText);
          setMsg({ type: "success", text: "Scanned." });
          return;
        }

        const parsed = parseTokenFromQrText(decodedText);

        if (!parsed?.token) {
          setMsg({ type: "danger", text: "Invalid QR code." });
          return;
        }

        // (Optional) enforce type if your QR includes it
        if (parsed.type) {
          if (role === "trainer" && parsed.type !== "trainer") {
            setMsg({ type: "warning", text: "Please scan the Trainer QR code." });
            return;
          }
          if (role === "user" && parsed.type !== "user") {
            setMsg({ type: "warning", text: "Please scan the Member QR code." });
            return;
          }
        }

        const endpoint =
          role === "trainer" ? "/trainer/check-in/scan" : "/user/check-in/scan";

        const res = await axiosClient.post(endpoint, { token: parsed.token });

        setMsg({
          type: "success",
          text: res?.data?.message || "Recorded successfully.",
        });
      } catch (e) {
        setMsg({
          type: "danger",
          text: e?.response?.data?.message || e?.message || "Scan failed.",
        });
      } finally {
        // Resume scanning after cooldown
        setTimeout(() => {
          if (cancelled) return;
          busyRef.current = false;
          try {
            scanner.resume();
          } catch {
            // ignore (can happen if scanner already cleared)
          }
        }, cooldownMs);
      }
    };

    const handleScanError = () => {
      // Keep empty: html5-qrcode fires this a LOT when it can't detect a code.
      // Putting setState here will cause unnecessary rerenders.
    };

    // Render scanner UI (creates the buttons/video/canvas)
    scanner.render(handleScanSuccess, handleScanError);

    return () => {
      cancelled = true;

      // ✅ cleanup
      try {
        // IMPORTANT: clear only on unmount (never inside scan callback)
        const current = scannerRef.current;
        if (current) {
          // clear() returns a promise in many versions
          Promise.resolve(current.clear()).catch(() => {});
        }
      } catch {
        // ignore
      } finally {
        scannerRef.current = null;
        busyRef.current = false;

        // allow future clean re-mount (important if you navigate away/back)
        initializedRef.current = false;
      }
    };
  }, [cooldownMs, onDecode, role, readerId]);

  return (
    <div style={{ maxWidth: 520, width: "100%" }}>
      <h5 style={{ marginBottom: 10 }}>QR Scan</h5>

      {msg && (
        <div
          style={{
            padding: "10px 12px",
            borderRadius: 8,
            marginBottom: 10,
            fontSize: 14,
            border: "1px solid rgba(255,255,255,0.08)",
            background:
              msg.type === "success"
                ? "rgba(0, 200, 0, 0.12)"
                : msg.type === "warning"
                ? "rgba(255, 200, 0, 0.12)"
                : "rgba(255, 0, 0, 0.12)",
          }}
        >
          {msg.text}
        </div>
      )}

      <div
        style={{
          width: "100%",
          borderRadius: 12,
          background: "#fff",
          padding: 10,
          overflow: "hidden",
        }}
      >
        <div id={readerId} style={{ width: "100%" }} />
      </div>

      {/* Responsive fixes for html5-qrcode injected elements */}
      <style>{`
        #${readerId} video,
        #${readerId} canvas {
          width: 100% !important;
          height: auto !important;
        }
        #${readerId} button,
        #${readerId} select {
          max-width: 100%;
        }
      `}</style>
    </div>
  );
}
