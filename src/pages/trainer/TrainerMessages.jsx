import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";
import { formatDateTimeDDMMYYYY } from "../../utils/dateFormat";

function toChatDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);

  return formatDateTimeDDMMYYYY(d);
}

export default function TrainerMessages() {
  const isMobile = useMemo(() => window.innerWidth < 768, []);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const [admin, setAdmin] = useState(null);
  const [messages, setMessages] = useState([]);

  const [error, setError] = useState(null);
  const [text, setText] = useState("");

  const bottomRef = useRef(null);
  const busyRef = useRef(false);

  const scrollToBottom = (smooth = true) => {
    bottomRef.current?.scrollIntoView({ behavior: smooth ? "smooth" : "auto" });
  };

  const fetchMessages = async ({ silent = false } = {}) => {
    if (busyRef.current) return;
    busyRef.current = true;

    if (!silent) setLoading(true);
    setError(null);

    try {
      const res = await axiosClient.get("/trainer/messages");
      const data = res?.data;

      setAdmin(data?.admin || null);
      setMessages(Array.isArray(data?.messages) ? data.messages : []);

      setTimeout(() => scrollToBottom(!silent), 50);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to load messages.");
    } finally {
      if (!silent) setLoading(false);
      busyRef.current = false;
    }
  };

  useEffect(() => {
    fetchMessages();
    const t = setInterval(() => fetchMessages({ silent: true }), 8000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = async () => {
    const body = text.trim();
    if (!body || sending) return;

    setSending(true);
    setError(null);

    try {
      await axiosClient.post("/trainer/messages", { body });
      setText("");
      await fetchMessages({ silent: true });
      scrollToBottom(true);
    } catch (e) {
      setError(e?.response?.data?.message || "Failed to send message.");
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isMobile) {
    return (
      <div className="container py-3" style={{ maxWidth: 720 }}>
        <div className="alert alert-warning mb-0">
          Trainer messages is optimized for mobile view.
        </div>
      </div>
    );
  }

  // ====== STYLE (matches screenshot) ======
  const pageWrap = {
    maxWidth: 720,
  };

  const chatPanel = {
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    minHeight: 520,
    maxHeight: "70vh",
    overflowY: "auto",
    padding: 14,
    backdropFilter: "blur(6px)",
  };

  const bubbleCommon = {
    borderRadius: 14,
    padding: "10px 12px",
    maxWidth: "78%",
    boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
    border: "1px solid rgba(255,255,255,0.08)",
  };

  const bubbleLeft = {
    ...bubbleCommon,
    background: "rgba(55,55,55,0.9)",
    color: "rgba(255,255,255,0.96)",
  };

  const bubbleRight = {
    ...bubbleCommon,
    background: "rgba(13,110,253,0.55)", // bootstrap-ish blue
    color: "rgba(255,255,255,0.98)",
    border: "1px solid rgba(13,110,253,0.35)",
  };

  const timeText = {
    marginTop: 6,
    fontSize: 12,
    fontWeight: 700,
    opacity: 0.85,
  };

  const composerWrap = {
    marginTop: 14,
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.35)",
    padding: 10,
    backdropFilter: "blur(6px)",
    display: "flex",
    gap: 10,
    alignItems: "center",
  };

  const inputStyle = {
    background: "rgba(0,0,0,0.45)",
    border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 12,
    color: "#fff",
    fontWeight: 650,
    resize: "none",
  };

  const sendBtnStyle = {
    borderRadius: 10,
    fontWeight: 900,
    minWidth: 74,
  };

  return (
    <div className="container py-3" style={pageWrap}>
      {/* Optional small header (can remove if you want only chat) */}
      {admin && (
        <div className="mb-2" style={{ color: "rgba(255,255,255,0.9)" }}>
          Chat with <b>{admin.name}</b>
        </div>
      )}

      {error && (
        <div className="alert alert-danger" style={{ fontWeight: 650 }}>
          {error}
        </div>
      )}

      {/* Chat panel */}
      <div style={chatPanel}>
        {loading ? (
          <div className="text-center py-5" style={{ color: "rgba(255,255,255,0.8)" }}>
            Loading...
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center py-5" style={{ color: "rgba(255,255,255,0.75)" }}>
            No messages yet.
          </div>
        ) : (
          messages.map((m) => {
            const mine = !!m?.is_trainer;
            return (
              <div
                key={m.id}
                style={{
                  display: "flex",
                  justifyContent: mine ? "flex-end" : "flex-start",
                  marginBottom: 10,
                }}
              >
                <div style={mine ? bubbleRight : bubbleLeft}>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                  <div style={timeText}>{toChatDateTime(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div style={composerWrap}>
        <textarea
          className="form-control"
          rows={1}
          placeholder="Type a message..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          style={inputStyle}
        />

        <button
          className="btn btn-primary"
          onClick={sendMessage}
          disabled={sending || text.trim().length === 0}
          style={sendBtnStyle}
        >
          {sending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
