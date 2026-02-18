import React, { useEffect, useMemo, useState } from "react";
import axiosClient from "../../api/axiosClient";

function normalizeSubscriptions(payload) {
  if (Array.isArray(payload?.subscriptions)) return payload.subscriptions;
  if (Array.isArray(payload?.class_subscriptions)) return payload.class_subscriptions;
  if (Array.isArray(payload?.data?.subscriptions)) return payload.data.subscriptions;
  if (Array.isArray(payload?.data?.class_subscriptions)) return payload.data.class_subscriptions;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload)) return payload;
  return [];
}

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return value;
  }
  return null;
}

function isClassSubscription(item) {
  const type = String(
    pick(item, ["subscription_type", "type", "category", "plan_type"]) || ""
  ).toLowerCase();
  if (type.includes("class")) return true;

  const planName = String(
    pick(item, ["plan_name", "package_name", "name", "title", "class_name"]) || ""
  ).toLowerCase();
  return planName.includes("class");
}

export default function AdminClassSubscriptions() {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    setMsg(null);

    const classEndpoints = [
      "/class-subscriptions",
      "/subscriptions/class",
      "/subscriptions?type=class",
    ];

    try {
      let list = [];
      let loaded = false;

      for (const endpoint of classEndpoints) {
        try {
          const res = await axiosClient.get(endpoint);
          list = normalizeSubscriptions(res?.data);
          loaded = true;
          break;
        } catch (error) {
          if (error?.response?.status !== 404) {
            throw error;
          }
        }
      }

      if (!loaded) {
        const fallbackRes = await axiosClient.get("/subscriptions");
        list = normalizeSubscriptions(fallbackRes?.data);
      }

      const onlyClass = list.filter(isClassSubscription);
      onlyClass.sort((a, b) => (b?.id ?? 0) - (a?.id ?? 0));
      setRows(onlyClass);
    } catch (error) {
      setRows([]);
      setMsg({
        type: "danger",
        text: error?.response?.data?.message || "Failed to load class subscriptions.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const emptyText = useMemo(() => {
    if (loading) return "Loading...";
    return "No class subscriptions found.";
  }, [loading]);

  return (
    <div className="admin-card p-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Class Subscriptions</h4>
          <div className="admin-muted">Users assigned to class subscription packages.</div>
        </div>

        <button className="btn btn-outline-light" onClick={load} disabled={loading}>
          <i className="bi bi-arrow-clockwise me-2"></i>
          {loading ? "Loading..." : "Refresh"}
        </button>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th style={{ width: 90 }}>ID</th>
              <th>User</th>
              <th>Phone</th>
              <th>Class</th>
              <th>Plan</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center text-muted py-4">
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const status = String(pick(row, ["status", "state"]) || "-");
                const className =
                  pick(row, ["class_name", "class_title", "class_plan_name"]) || "-";
                return (
                  <tr key={row.id}>
                    <td>{row.id}</td>
                    <td>{pick(row, ["member_name", "user_name", "name"]) || "-"}</td>
                    <td>{pick(row, ["member_phone", "user_phone", "phone"]) || "-"}</td>
                    <td>
                      <span className="badge bg-info text-dark">{className}</span>
                    </td>
                    <td>{pick(row, ["plan_name", "package_name", "name"]) || "-"}</td>
                    <td>{pick(row, ["start_date", "starts_at", "start"]) || "-"}</td>
                    <td>{pick(row, ["end_date", "ends_at", "end"]) || "-"}</td>
                    <td>
                      <span className="badge bg-secondary" style={{ textTransform: "capitalize" }}>
                        {status}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
