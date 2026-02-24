import React, { useEffect, useMemo, useRef, useState, useId } from "react";
import { Html5Qrcode } from "html5-qrcode";
import "./qr-scannser.css";
import { FaCamera } from "react-icons/fa";

/**
 * QrScanner
 * - single instance (StrictMode-safe)
 * - scanner box always visible
 * - permission overlay before camera starts
 * - supports stop scanning via `active`
 *
 * Props:
 * - onDecode: async (decodedText) => void
 * - active: boolean (default true)
 * - cooldownMs: number
 * - onStateChange?: ({ cameraReady: boolean }) => void
 */
export default function QrScanner({
  onDecode,
  active = true,
  cooldownMs = 1500,
  onStateChange,
}) {
  const reactId = useId();
  const readerId = useMemo(
    () => `qr-reader-${reactId.replace(/[:]/g, "")}`,
    [reactId]
  );

  const qrRef = useRef(null);
  const startedRef = useRef(false);
  const busyRef = useRef(false);
  const lastScanRef = useRef({ text: "", at: 0 });

  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState(null);

  const setReady = (val) => {
    setCameraReady(val);
    if (onStateChange) onStateChange({ cameraReady: val });
  };

  const stopScanning = async () => {
    try {
      if (qrRef.current) {
        // stop() throws if not started; guard
        try {
          await qrRef.current.stop();
        } catch (error) {
          console.debug("Scanner stop skipped", error);
        }
        try {
          await qrRef.current.clear();
        } catch (error) {
          console.debug("Scanner stop skipped", error);
        }
      }
    } finally {
      qrRef.current = null;
      startedRef.current = false;
      setReady(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    // If scanning is disabled, ensure camera is off
    if (!active) {
      stopScanning();
      return;
    }

    const start = async () => {
      if (startedRef.current) return; // prevent double start
      startedRef.current = true;

      setError(null);

      const qr = new Html5Qrcode(readerId);
      qrRef.current = qr;

      try {
        await qr.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: (vw, vh) => {
              const size = Math.min(vw, vh, 320);
              return { width: size, height: size };
            },
          },
          async (text) => {
            if (cancelled) return;

            const now = Date.now();

            // duplicate within cooldown
            if (
              text === lastScanRef.current.text &&
              now - lastScanRef.current.at < cooldownMs
            ) {
              return;
            }

            // block while processing
            if (busyRef.current) return;

            lastScanRef.current = { text, at: now };
            busyRef.current = true;

            try {
              await onDecode(text);
            } finally {
              setTimeout(() => {
                busyRef.current = false;
              }, cooldownMs);
            }
          },
          () => {
            // ignore per-frame failures
          }
        );

        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) {
          setError(
            e?.message ||
              "Camera permission denied or camera not available. Please allow camera."
          );
          setReady(false);
        }
        await stopScanning();
      }
    };

    start();

    return () => {
      cancelled = true;
      stopScanning();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, cooldownMs, onDecode, readerId]);

  return (
    <div className="qr-frame">
      {/* Camera mount point */}
      <div id={readerId} className="qr-video" />

      {/* Scanner overlay ALWAYS visible (so user sees box immediately) */}
      <div className="qr-overlay">
        <div className="qr-box">
          <span className="qr-scanline" />
        </div>
      </div>

      {/* Permission overlay shown until camera is ready */}
      {active && !cameraReady && !error && (
        <div className="qr-permission-overlay">
          <div className="qr-permission-card">
            <div className="qr-icon"><FaCamera/></div>
            <div className="qr-title">Camera Permission</div>
            <p className="qr-subtitle">
              Tap <b>Allow</b> to open scanner.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="alert alert-danger mt-2" style={{ fontWeight: 600 }}>
          {error}
        </div>
      )}
    </div>
  );
}
