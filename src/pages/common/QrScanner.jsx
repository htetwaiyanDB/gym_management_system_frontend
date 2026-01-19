import React, { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import axiosClient from "../../api/axiosClient";
import { parseTokenFromQrText } from "../../utils/qr";

export default function QrScanner({ role, onDecode, cooldownMs = 1200 }) {
  const [msg, setMsg] = useState(null);
  const busyRef = useRef(false);
  const scannerRef = useRef(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5Qrcode("qr-reader");
    scannerRef.current = scanner;

    const handleDecode = async (decodedText) => {
      if (busyRef.current) return;

      if (onDecode) {
        busyRef.current = true;
        try {
          await onDecode(decodedText);
        } finally {
          setTimeout(() => {
            busyRef.current = false;
          }, cooldownMs);
        }
        return;
      }
      busyRef.current = true;
      const parsed = parseTokenFromQrText(decodedText);

      if (!parsed) {
        setMsg({ type: "danger", text: "Invalid QR. Please scan the gym QR code." });
        setTimeout(() => {
          busyRef.current = false;
        }, cooldownMs);
        return;
      }

      // Optional safety: enforce scanning correct type QR
      if (parsed.type && role === "user" && parsed.type !== "user") {
        setMsg({ type: "warning", text: "Please scan the Member QR code." });
        setTimeout(() => {
          busyRef.current = false;
        }, cooldownMs);
        return;
      }
      if (parsed.type && role === "trainer" && parsed.type !== "trainer") {
        setMsg({ type: "warning", text: "Please scan the Trainer QR code." });
        setTimeout(() => {
          busyRef.current = false;
        }, cooldownMs);
        return;
      }

      try {
        const endpoint =
          role === "trainer" ? "/trainer/check-in/scan" : "/user/check-in/scan";

        const res = await axiosClient.post(endpoint, { token: parsed.token });

        // backend toggles automatically: first scan check-in, second scan check-out
        setMsg({ type: "success", text: res?.data?.message || "Recorded." });
      } catch (e) {
        setMsg({
          type: "danger",
          text: e?.response?.data?.message || "Scan failed.",
        });
      } finally {        setTimeout(() => {
          busyRef.current = false;
        }, cooldownMs);
      }
    };

    const startScanner = async () => {
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!cameras || cameras.length === 0) {
          setMsg({ type: "warning", text: "No camera found on this device." });
          return;
        }

        const preferredCamera =
          cameras.find((camera) => camera.label.toLowerCase().includes("back")) || cameras[0];

        await scanner.start(
          preferredCamera.id,
          { fps: 10, qrbox: { width: 240, height: 240 } },
          handleDecode,
          () => {}
        );

        startedRef.current = true;
      } catch (e) {
        setMsg({
          type: "danger",
          text: e?.message || "Unable to start camera scanner.",
        });
      }
    };

    startScanner();

    return () => {
      if (scannerRef.current) {
        const current = scannerRef.current;
        scannerRef.current = null;
        if (startedRef.current) {
          current
            .stop()
            .then(() => current.clear())
            .catch(() => {});
        } else {
          current.clear().catch(() => {});
        }
      }
      startedRef.current = false;
    };
  }, [cooldownMs, onDecode, role]);

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <h4 className="mb-3">QR Scan</h4>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div
        id="qr-reader"
        className="border rounded p-2 bg-light d-flex justify-content-center"
        style={{ minHeight: 260 }}
      />
      <div className="text-muted small mt-2">
        Scan twice: first = check-in, second = check-out.
      </div>
    </div>
  );
}