import React, { useEffect, useMemo, useRef, useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import axiosClient from "../../api/axiosClient";
import { parseTokenFromQrText } from "../../utils/qr";

export default function QrScanner({ role, onDecode, cooldownMs = 1200 }) {
  const [msg, setMsg] = useState(null);

  const scannerRef = useRef(null);
  const busyRef = useRef(false);

  // unique id per mount (prevents DOM conflicts on re-render/remount)
  const readerId = useMemo(
    () => `qr-reader-${Math.random().toString(36).slice(2)}`,
    []
  );

  useEffect(() => {
    let cancelled = false;

    const getQrBox = () => {
      // responsive qrbox based on container width (cap it for phones)
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

    const handleScan = async (decodedText) => {
      if (cancelled) return;
      if (busyRef.current) return;

      busyRef.current = true;

      try {
        // pause scanning while we process (prevents duplicate rapid fires)
        scanner.pause(true);

        if (onDecode) {
          await onDecode(decodedText);
          return;
        }

        const parsed = parseTokenFromQrText(decodedText);

        if (!parsed) {
          setMsg({ type: "danger", text: "Invalid QR. Please scan the gym QR code." });
          return;
        }

        // Optional safety: enforce scanning correct type QR
        if (parsed.type && role === "user" && parsed.type !== "user") {
          setMsg({ type: "warning", text: "Please scan the Member QR code." });
          return;
        }
        if (parsed.type && role === "trainer" && parsed.type !== "trainer") {
          setMsg({ type: "warning", text: "Please scan the Trainer QR code." });
          return;
        }

        const endpoint =
          role === "trainer" ? "/trainer/check-in/scan" : "/user/check-in/scan";

        const res = await axiosClient.post(endpoint, { token: parsed.token });

        setMsg({ type: "success", text: res?.data?.message || "Recorded." });
      } catch (e) {
        setMsg({
          type: "danger",
          text: e?.response?.data?.message || "Scan failed.",
        });
      } finally {
        // resume after cooldown
        setTimeout(() => {
          if (cancelled) return;
          busyRef.current = false;
          try {
            scanner.resume();
          } catch {
            // ignore if scanner already cleared/unmounted
          }
        }, cooldownMs);
      }
    };

    scanner.render(handleScan);

    const onResize = () => {
      // html5-qrcode doesn't always resize perfectly, but this helps on orientation change
      // safest: do nothing aggressive; CSS below handles most cases
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);

      // IMPORTANT: clear ONLY on unmount (prevents removeChild crash)
      try {
        scanner.clear().catch(() => {});
      } catch {
        // ignore
      }
    };
  }, [cooldownMs, onDecode, role, readerId]);

  return (
    <div className="container py-3" style={{ maxWidth: 520 }}>
      <h4 className="mb-3">QR Scan</h4>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* responsive wrapper */}
      <div className="qr-wrap border rounded p-2 bg-light">
        <div id={readerId} className="qr-reader" />
      </div>

      <div className="text-muted small mt-2">
        Scan twice: first = check-in, second = check-out.
      </div>

      {/* Make injected video/canvas responsive */}
      <style>{`
        .qr-wrap { width: 100%; }
        .qr-reader { width: 100%; }
        .qr-reader video,
        .qr-reader canvas {
          width: 100% !important;
          height: auto !important;
        }
        /* make the injected buttons not overflow on small screens */
        .qr-reader button, .qr-reader select {
          max-width: 100%;
        }
      `}</style>
    </div>
  );
}
