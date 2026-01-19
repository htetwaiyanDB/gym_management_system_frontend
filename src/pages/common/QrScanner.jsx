import React, { useEffect, useRef ,useState } from "react";
import { Html5QrcodeScanner } from "html5-qrcode";
import axiosClient from "../../api/axiosClient";
import { parseTokenFromQrText } from "../../utils/qr";

export default function QrScanner({ role, onDecode, cooldownMs = 1200 }) {
  const [msg, setMsg] = useState(null);
  const busyRef = useRef(false);

  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "qr-reader",
      { fps: 10, qrbox: 250 },
      false
    );

    scanner.render(async (decodedText) => {
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
      } finally {
        scanner.clear().catch(() => {});
      }
    });

    return () => scanner.clear().catch(() => {});
   }, [cooldownMs, onDecode, role]);

  return (
    <div className="container py-4" style={{ maxWidth: 720 }}>
      <h4 className="mb-3">QR Scan</h4>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div id="qr-reader" className="border rounded p-2 bg-light" />
      <div className="text-muted small mt-2">
        Scan twice: first = check-in, second = check-out.
      </div>
    </div>
  );
}
