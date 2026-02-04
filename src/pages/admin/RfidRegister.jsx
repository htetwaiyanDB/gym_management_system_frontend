import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import { registerRfidCard } from "../../api/attendanceApi";
import { normalizeCardId } from "../../utils/rfid";

export default function RfidRegister() {
  const nav = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState("");
  const [cardId, setCardId] = useState(() => localStorage.getItem("rfid_pending_card_id") || "");
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    axiosClient
      .get("/attendance/users")
      .then((res) => {
        if (!alive) return;
        const list = res.data?.users || res.data?.data || (Array.isArray(res.data) ? res.data : []);
        setUsers(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (!alive) return;
        setUsers([]);
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, []);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setMsg(null);

    const normalized = normalizeCardId(cardId);
    if (!userId) {
      setMsg({ type: "danger", text: "Please select a user." });
      return;
    }
    if (!normalized) {
      setMsg({ type: "danger", text: "Please provide a valid card ID." });
      return;
    }

    try {
      setLoading(true);
      const res = await registerRfidCard(userId, normalized);
      localStorage.removeItem("rfid_pending_card_id");
      setMsg({ type: "success", text: res?.data?.message || "RFID card registered." });
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to register RFID card." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h4 className="mb-1">RFID Card Registration</h4>
          <div className="admin-muted">Link an RFID card to a user for attendance scanning.</div>
        </div>
        <button className="btn btn-outline-light" onClick={() => nav("/admin/attendance")} disabled={loading}>
          Back to Attendance
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <form className="card" onSubmit={handleSubmit}>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="form-label fw-bold">User</label>
              <select
                className="form-select bg-dark text-white"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                disabled={loading}
              >
                <option value="">{loading ? "Loading users..." : "Select user"}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label fw-bold">RFID Card ID</label>
              <input
                className="form-control bg-dark text-white"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
                placeholder="Scan or type card ID"
                disabled={loading}
              />
            </div>
            <div className="col-12">
              <button className="btn btn-success" type="submit" disabled={loading}>
                {loading ? "Registering..." : "Register Card"}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
