import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.conversations)) return payload.conversations;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function safeText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function parseBackendDateTime(s) {
  if (!s) return null;
  const iso = String(s).includes("T") ? String(s) : String(s).replace(" ", "T");
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

// match style used in other admin pages
function formatDateTimeVideoStyle(s) {
  const d = parseBackendDateTime(s);
  if (!d) return "-";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

function getUserId(convo) {
  // backend could return {user_id}, {id}, {user:{id}}, etc.
  return (
    convo?.user_id ??
    convo?.user?.id ??
    convo?.id ??
    convo?.other_user_id ??
    convo?.receiver_id ??
    null
  );
}

function getUserLabel(convo) {
  // show best possible name
  const name =
    convo?.name ||
    convo?.user?.name ||
    convo?.user_name ||
    convo?.username ||
    convo?.phone ||
    convo?.email ||
    null;

  const role = convo?.role || convo?.user?.role || null;
  const extra =
    role ? ` • ${String(role).charAt(0).toUpperCase()}${String(role).slice(1)}` : "";

  return (name ? String(name) : `User #${getUserId(convo) || "-"}`) + extra;
}

function getLastMessage(convo) {
  return (
    convo?.last_message ||
    convo?.lastMessage ||
    convo?.message ||
    convo?.preview ||
    convo?.snippet ||
    ""
  );
}

function getUpdatedAt(convo) {
  return convo?.updated_at || convo?.last_time || convo?.lastTime || convo?.created_at || null;
}

function normalizeThread(payload) {
  // thread endpoint could return:
  // { messages: [...] } OR { data: [...] } OR array directly
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.messages)) return payload.messages;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function msgText(m) {
  return m?.message || m?.body || m?.text || "";
}

function msgTime(m) {
  return m?.created_at || m?.time || m?.sent_at || m?.updated_at || null;
}

function msgSender(m) {
  // try to determine if it's admin or user
  // backend might have sender_id, from_id, is_admin, sender.role, etc.
  const role =
    m?.sender_role || m?.sender?.role || (m?.is_admin ? "admin" : null) || null;
  return role;
}

export default function AdminMessages() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  // left list
  const [convos, setConvos] = useState([]);
  const [q, setQ] = useState("");

  // right thread
  const [activeUserId, setActiveUserId] = useState(null);
  const [activeLabel, setActiveLabel] = useState("");
  const [threadLoading, setThreadLoading] = useState(false);
  const [thread, setThread] = useState([]);

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const loadConversations = async () => {
    setMsg(null);
    setLoading(true);
    try {
      const res = await axiosClient.get("/messages");
      setConvos(normalizeList(res.data));
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load conversations." });
    } finally {
      setLoading(false);
    }
  };

  const loadThread = async (userId) => {
    if (!userId) return;
    setMsg(null);
    setThreadLoading(true);
    try {
      const res = await axiosClient.get(`/messages/${userId}`);
      const list = normalizeThread(res.data);

      // sort oldest -> newest for chat view
      const sorted = [...list].sort((a, b) => {
        const ta = parseBackendDateTime(msgTime(a))?.getTime() ?? 0;
        const tb = parseBackendDateTime(msgTime(b))?.getTime() ?? 0;
        return ta - tb;
      });

      setThread(sorted);
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load messages." });
      setThread([]);
    } finally {
      setThreadLoading(false);
    }
  };

  const openConversation = async (c) => {
    const userId = getUserId(c);
    if (!userId) {
      setMsg({ type: "danger", text: "Cannot open this conversation (missing user id)." });
      return;
    }
    setActiveUserId(userId);
    setActiveLabel(getUserLabel(c));
    await loadThread(userId);
  };

  const sendMessage = async () => {
    if (!activeUserId) return;
    const text = safeText(draft).trim();
    if (!text) return;

    setSending(true);
    setMsg(null);
    try {
      await axiosClient.post(`/messages/${activeUserId}`, { body: text });

      setDraft("");
      // reload thread + list so preview updates
      await Promise.all([loadThread(activeUserId), loadConversations()]);
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to send message." });
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  const filteredConvos = useMemo(() => {
    const term = safeText(q).trim().toLowerCase();
    if (!term) return convos;

    return convos.filter((c) => {
      const label = getUserLabel(c).toLowerCase();
      const last = safeText(getLastMessage(c)).toLowerCase();
      return label.includes(term) || last.includes(term);
    });
  }, [convos, q]);

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-start justify-content-between mb-3">
        

        <button className="btn btn-outline-light" onClick={loadConversations} disabled={loading}>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="row g-3">
        {/* LEFT: conversations */}
        <div className="col-12 col-lg-4">
          <div className="card bg-transparent border-0">
            <div className="d-flex gap-2 mb-2">
              <input
                className="form-control admin-search"
                placeholder="Search..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{
                  background: "rgba(0,0,0,0.35)",
                  color: "#fff",
                  border: "1px solid rgba(255,255,255,0.14)",
                }}
              />
              <style>
    {`
      .admin-search::placeholder {
        color: #ffffff !important;
        font-weight: 600;
        opacity: 1; /* Firefox fix */
      }
    `}
  </style>

            </div>

            <div className="table-responsive">
              <table className="table table-dark table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th>User</th>
                    <th style={{ width: 120 }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredConvos.length === 0 ? (
                    <tr>
                      <td colSpan="2" className="text-center text-muted py-4">
                        {loading ? "Loading..." : "No conversations."}
                      </td>
                    </tr>
                  ) : (
                    filteredConvos.map((c, idx) => {
                      const userId = getUserId(c);
                      const active = activeUserId && userId === activeUserId;

                      return (
                        <tr
                          key={userId || idx}
                          style={{ cursor: "pointer" }}
                          onClick={() => openConversation(c)}
                          className={active ? "table-active" : ""}
                        >
                          <td>
                            <div className="fw-semibold">{getUserLabel(c)}</div>
                            <div className="text-light small" style={{ maxWidth: 280 }}>
                              {safeText(getLastMessage(c)).slice(0, 60)}
                              {safeText(getLastMessage(c)).length > 60 ? "..." : ""}
                            </div>
                          </td>
                          <td className="text-light small">
                            {formatDateTimeVideoStyle(getUpdatedAt(c))}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <div className="admin-muted small mt-2">
              Click a row to open the chat thread.
            </div>
          </div>
        </div>

        {/* RIGHT: thread */}
        <div className="col-12 col-lg-8">
          <div
            className="card"
            style={{
              background: "rgba(0,0,0,0.30)",
              border: "1px solid rgba(255,255,255,0.14)",
              boxShadow: "0 10px 35px rgba(0,0,0,0.25)",
            }}
          >
            <div
              className="card-header d-flex align-items-center justify-content-between"
              style={{
                background: "rgba(0,0,0,0.25)",
                borderBottom: "1px solid rgba(255,255,255,0.10)",
                color: "#fff",
              }}
            >
              <div className="fw-semibold text-light">
                {activeUserId ? activeLabel : "Select a conversation"}
              </div>

              {activeUserId && (
                <button
                  className="btn btn-sm btn-outline-light"
                  onClick={() => loadThread(activeUserId)}
                  disabled={threadLoading}
                >
                  {threadLoading ? "Loading..." : "Reload"}
                </button>
              )}
            </div>

            <div
              className="card-body"
              style={{
                minHeight: 360,
                maxHeight: 520,
                overflowY: "auto",
              }}
            >
              {!activeUserId ? (
                <div className="text-light">Choose a user from the left list.</div>
              ) : threadLoading ? (
                <div className="text-light">Loading messages...</div>
              ) : thread.length === 0 ? (
                <div className="text-light">No messages yet.</div>
              ) : (
                <div className="d-flex flex-column gap-2">
                  {thread.map((m, i) => {
                    const role = (msgSender(m) || "").toLowerCase();
                    const isAdmin =
                      role === "admin" ||
                      role === "administrator" ||
                      role === "system" ||
                      m?.is_admin === true;

                    return (
                      <div
                        key={m?.id || i}
                        className={`d-flex ${isAdmin ? "justify-content-end" : "justify-content-start"}`}
                      >
                        <div
                          style={{
                            maxWidth: "78%",
                            background: isAdmin ? "rgba(13,110,253,0.25)" : "rgba(255,255,255,0.10)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: 14,
                            padding: "10px 12px",
                            color: "rgba(255,255,255,0.90)",
                          }}
                        >
                          <div style={{ whiteSpace: "pre-wrap" }}>
                            {safeText(msgText(m))}
                          </div>
                          <div className="small text-light mt-1">
                            {formatDateTimeVideoStyle(msgTime(m))}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div
              className="card-footer"
              style={{
                background: "rgba(0,0,0,0.20)",
                borderTop: "1px solid rgba(255,255,255,0.10)",
              }}
            >
              <div className="d-flex gap-2">
                <input
                  className="form-control"
                  placeholder={activeUserId ? "Type a message..." : "Select a conversation first"}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={!activeUserId || sending}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendMessage();
                  }}
                  style={{
                    background: "rgba(0,0,0,0.35)",
                    color: "#fff",
                    border: "1px solid rgba(255,255,255,0.14)",
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={sendMessage}
                  disabled={!activeUserId || sending || !safeText(draft).trim()}
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </div>

              
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
