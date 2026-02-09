// AdminDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import axiosClient from "../../api/axiosClient";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
} from "recharts";

/**
 * ✅ API BASE ONLY
 * Uses:
 *  - GET /api/dashboard/attendance-report
 *  - GET /api/dashboard/growth-summary?months=6
 *  - GET /api/dashboard/export/excel
 *  - GET /api/dashboard/export/json
 */
const API = {
  ATTENDANCE_REPORT: "/dashboard/attendance-report",
  GROWTH_SUMMARY: "/dashboard/growth-summary",
  EXPORT_EXCEL: "/dashboard/export/excel",
  EXPORT_JSON: "/dashboard/export/json",
};

const POLL_GROWTH_EVERY_MS = 30000; // 30s (set to 0 to disable)

// ---------------- helpers ----------------
const n = (v) => {
  const num = Number(v);
  return Number.isFinite(num) ? num : 0;
};

const deepGet = (obj, path) => {
  try {
    return path.split(".").reduce((acc, k) => acc?.[k], obj);
  } catch {
    return undefined;
  }
};

const deepPick = (obj, paths, fallback = 0) => {
  for (const p of paths) {
    const v = p.includes(".") ? deepGet(obj, p) : obj?.[p];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return fallback;
};

const sumArr = (arr = []) => arr.reduce((a, b) => a + n(b), 0);
const lastVal = (arr = []) => (arr.length ? n(arr[arr.length - 1]) : 0);

const normalizeReportPayload = (resData) => {
  let payload =
    resData?.data ??
    resData?.report ??
    resData?.payload ??
    resData?.result ??
    resData?.attendance_report ??
    resData?.summary ??
    resData;

  const unwrapKeys = ["data", "report", "stats", "summary", "attendance_report", "payload", "result"];

  let guard = 0;
  while (payload && typeof payload === "object" && guard < 8) {
    guard++;
    const keys = Object.keys(payload);

    if (keys.length === 1 && unwrapKeys.includes(keys[0])) {
      payload = payload[keys[0]];
      continue;
    }

    let moved = false;
    for (const k of unwrapKeys) {
      if (payload?.[k] && typeof payload[k] === "object") {
        payload = payload[k];
        moved = true;
        break;
      }
    }
    if (moved) continue;

    break;
  }

  return payload || {};
};

// ---------------- styles ----------------
const cardGlass = {
  background: "rgba(0,0,0,0.38)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 10px 35px rgba(0,0,0,0.35)",
  borderRadius: 16,
};

const titleText = { color: "rgba(255,255,255,0.92)" };
const mutedText = { color: "rgba(255,255,255,0.60)" };

const glassInputStyle = {
  background: "rgba(0,0,0,0.55)",
  color: "#fff",
  border: "1px solid rgba(255,255,255,0.18)",
};

function MetricAreaChart({ title, data, stroke, fill }) {
  return (
    <div className="p-3 mb-3" style={{ ...cardGlass, background: "rgba(255,255,255,0.06)" }}>
      <div className="d-flex justify-content-between align-items-center mb-2">
        <div style={{ ...titleText, fontWeight: 600 }}>{title}</div>
        <div className="small" style={mutedText}>
          Last months
        </div>
      </div>

      <div style={{ width: "100%", height: 130 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
            <XAxis dataKey="name" stroke="rgba(255,255,255,0.55)" tick={{ fontSize: 10 }} />
            <YAxis stroke="rgba(255,255,255,0.55)" tick={{ fontSize: 10 }} />
            <Tooltip
              contentStyle={{
                background: "rgba(0,0,0,0.85)",
                border: "1px solid rgba(255,255,255,0.15)",
              }}
              labelStyle={{ color: "#fff" }}
            />
            <Area type="monotone" dataKey="value" stroke={stroke} fill={fill} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export default function AdminDashboard() {
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const [raw, setRaw] = useState(null);
  const [report, setReport] = useState({});
  const [showDebug, setShowDebug] = useState(false);

  // ✅ chart series states (from /api/dashboard/growth-summary)
  const [usersGrowthData, setUsersGrowthData] = useState([]);
  const [subscriptionsData, setSubscriptionsData] = useState([]);
  const [trainerBookingsData, setTrainerBookingsData] = useState([]);
  const [boxingBookingsData, setBoxingBookingsData] = useState([]);

  // prevent StrictMode double-fetch in dev
  const didInitRef = useRef(false);

  // cancel requests on unmount
  const abortRef = useRef(null);
  useEffect(() => {
    abortRef.current = new AbortController();
    return () => abortRef.current?.abort?.();
  }, []);

  const loadReport = async () => {
    setLoading(true);
    setMsg(null);

    try {
      const res = await axiosClient.get(API.ATTENDANCE_REPORT, {
        signal: abortRef.current?.signal,
        params: { from: from || undefined, to: to || undefined },
        cache: false,
      });

      setRaw(res?.data || null);
      const payload = normalizeReportPayload(res?.data);
      setReport(payload || {});
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;

      setMsg({
        type: "danger",
        text: e?.response?.data?.message || "Failed to load dashboard report.",
      });
    } finally {
      setLoading(false);
    }
  };

  // ✅ uses your new backend endpoint
  const loadGrowthSeries = async (months = 6) => {
    try {
      const res = await axiosClient.get(API.GROWTH_SUMMARY, {
        params: { months },
        signal: abortRef.current?.signal,
        cache: false,
      });

      const payload = res?.data?.data ?? res?.data ?? {};
      const labels = Array.isArray(payload.labels) ? payload.labels : [];
      const usersArr = Array.isArray(payload.users) ? payload.users : [];
      const subsArr = Array.isArray(payload.subscriptions) ? payload.subscriptions : [];
      const bookingsArr = Array.isArray(payload.trainer_bookings) ? payload.trainer_bookings : [];
      const boxingArr = Array.isArray(payload.boxing_bookings)
        ? payload.boxing_bookings
        : Array.isArray(payload.boxingBookings)
          ? payload.boxingBookings
          : [];

      const toSeries = (vals) =>
        labels.map((lbl, i) => ({
          name: String(lbl),
          value: n(vals?.[i]),
        }));

      setUsersGrowthData(toSeries(usersArr));
      setSubscriptionsData(toSeries(subsArr));
      setTrainerBookingsData(toSeries(bookingsArr));
      setBoxingBookingsData(toSeries(boxingArr));
    } catch (e) {
      if (e?.name === "CanceledError" || e?.code === "ERR_CANCELED") return;

      setMsg({
        type: "warning",
        text: e?.response?.data?.message || "Failed to load growth graphs (/api/dashboard/growth-summary).",
      });
    }
  };

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    loadReport();
    loadGrowthSeries(6);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ optional polling for “real-time”
  useEffect(() => {
    if (!POLL_GROWTH_EVERY_MS) return;

    const t = setInterval(() => {
      loadGrowthSeries(6);
    }, POLL_GROWTH_EVERY_MS);

    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // metrics from attendance report
  const metrics = useMemo(() => {
    const r = report || {};
    const labels = Array.isArray(r.labels) ? r.labels : [];
    const checkInsArr = Array.isArray(r.check_ins) ? r.check_ins : [];
    const checkOutsArr = Array.isArray(r.check_outs) ? r.check_outs : [];

    const sumIn = sumArr(checkInsArr);
    const sumOut = sumArr(checkOutsArr);

    const totalMembers = n(deepPick(r, ["cards.total_members", "total_members"], 0));
    const activeCheckins = n(
      deepPick(r, ["cards.active_check_ins", "active_checkins", "active_check_ins"], sumIn - sumOut)
    );
    const todayCheckins = n(
      deepPick(r, ["cards.today_check_in", "today_checkins", "today_check_in"], lastVal(checkInsArr))
    );
    const todayCheckouts = n(
      deepPick(r, ["cards.today_check_out", "today_checkouts", "today_check_out"], lastVal(checkOutsArr))
    );

    const chart = labels.map((lbl, i) => ({
      date: lbl,
      in: n(checkInsArr[i]),
      out: n(checkOutsArr[i]),
    }));

    return {
      totalMembers,
      activeCheckins,
      todayCheckins,
      todayCheckouts,
      chart,
      period: r.period || "7days",
    };
  }, [report]);

  const attendanceBarData = useMemo(() => {
    return (metrics.chart || []).map((d) => ({
      label: d.date,
      check_in: n(d.in),
      check_out: n(d.out),
    }));
  }, [metrics.chart]);

  // ✅ robust export handlers
  const decodeBlobErrorMessage = async (err) => {
    try {
      const data = err?.response?.data;
      if (data instanceof Blob) {
        const text = await data.text();
        try {
          const parsed = JSON.parse(text);
          return parsed?.message || text;
        } catch {
          return text;
        }
      }
    } catch {
      // ignore
    }
    return null;
  };

  const exportExcel = async () => {
    setMsg(null);
    try {
      const res = await axiosClient.get(API.EXPORT_EXCEL, {
        signal: abortRef.current?.signal,
        params: { from: from || undefined, to: to || undefined },
        responseType: "blob",
        headers: { Accept: "*/*" },
      });

      const contentType = res.headers?.["content-type"] || "application/octet-stream";
      const blob = new Blob([res.data], { type: contentType });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-report_${metrics.period}.xls`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMsg({ type: "success", text: "Exported successfully (excel)." });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      const serverMsg = e?.response?.data?.message || (await decodeBlobErrorMessage(e));
      setMsg({ type: "danger", text: serverMsg || "Export failed (excel)." });
    }
  };

  const exportJson = async () => {
    setMsg(null);
    try {
      const res = await axiosClient.get(API.EXPORT_JSON, {
        signal: abortRef.current?.signal,
        params: { from: from || undefined, to: to || undefined },
        responseType: "json",
        headers: { Accept: "application/json" },
      });

      const jsonStr = JSON.stringify(res.data, null, 2);
      const blob = new Blob([jsonStr], { type: "application/json" });
      const url = window.URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = url;
      a.download = `attendance-report_${metrics.period}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMsg({ type: "success", text: "Exported successfully (json)." });
      setTimeout(() => setMsg(null), 2500);
    } catch (e) {
      const serverMsg = e?.response?.data?.message || "Export failed (json).";
      setMsg({ type: "danger", text: serverMsg });
    }
  };

  return (
    <div className="admin-card p-4">
      {/* Header */}
      <div className="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
        <div>
          <h4 className="mb-1" style={titleText}>
            Dashboard
          </h4>
          <div style={mutedText}>Attendance report overview and growth graphs.</div>
        </div>

        <div className="d-flex flex-wrap gap-2 align-items-end">
          <div>
            <div className="small mb-1" style={mutedText}>
              From
            </div>
            <input
              type="date"
              className="form-control"
              style={glassInputStyle}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              id="dashboard-from"
              name="dashboard_from"
            />
          </div>

          <div>
            <div className="small mb-1" style={mutedText}>
              To
            </div>
            <input
              type="date"
              className="form-control"
              style={glassInputStyle}
              value={to}
              onChange={(e) => setTo(e.target.value)}
              id="dashboard-to"
              name="dashboard_to"
            />
          </div>

          <button
            className="btn btn-outline-light"
            onClick={loadReport}
            disabled={loading}
            style={{ height: 38, marginTop: 19 }}
          >
            {loading ? "Loading..." : "Apply"}
          </button>

          <button
            className="btn btn-outline-info"
            onClick={() => setShowDebug((s) => !s)}
            style={{ height: 38, marginTop: 19 }}
          >
            {showDebug ? "Hide Debug" : "Debug"}
          </button>
        </div>
      </div>

      {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

      {/* Debug Panel */}
      {showDebug && (
        <div className="mb-3 p-3" style={{ ...cardGlass, overflowX: "auto" }}>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <div style={titleText} className="fw-semibold">
              Debug Response
            </div>
            <button
              className="btn btn-sm btn-outline-light"
              onClick={() => {
                setRaw(null);
                setReport({});
              }}
            >
              Clear
            </button>
          </div>

          <div className="row g-2">
            <div className="col-12 col-lg-6">
              <div className="small mb-1" style={mutedText}>
                RAW (res.data)
              </div>
              <pre style={{ color: "#fff", fontSize: 12, whiteSpace: "pre-wrap" }}>
                {raw ? JSON.stringify(raw, null, 2) : "No raw yet"}
              </pre>
            </div>
            <div className="col-12 col-lg-6">
              <div className="small mb-1" style={mutedText}>
                NORMALIZED (used by UI)
              </div>
              <pre style={{ color: "#fff", fontSize: 12, whiteSpace: "pre-wrap" }}>
                {report ? JSON.stringify(report, null, 2) : "No normalized yet"}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Top cards */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-md-6 col-xl-3">
          <div className="p-3" style={cardGlass}>
            <div style={mutedText}>Total Members</div>
            <div style={{ ...titleText, fontSize: 28, fontWeight: 700 }}>{metrics.totalMembers}</div>
            <div className="small" style={mutedText}>
              All registered gym members
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <div className="p-3" style={cardGlass}>
            <div style={mutedText}>Active Check-ins</div>
            <div style={{ ...titleText, fontSize: 28, fontWeight: 700 }}>{metrics.activeCheckins}</div>
            <div className="small" style={mutedText}>
              Currently inside (checked-in)
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <div className="p-3" style={cardGlass}>
            <div style={mutedText}>Today Check-in</div>
            <div style={{ ...titleText, fontSize: 28, fontWeight: 700 }}>{metrics.todayCheckins}</div>
            <div className="small" style={mutedText}>
              Scans recorded today (in)
            </div>
          </div>
        </div>

        <div className="col-12 col-md-6 col-xl-3">
          <div className="p-3" style={cardGlass}>
            <div style={mutedText}>Today Check-out</div>
            <div style={{ ...titleText, fontSize: 28, fontWeight: 700 }}>{metrics.todayCheckouts}</div>
            <div className="small" style={mutedText}>
              Scans recorded today (out)
            </div>
          </div>
        </div>
      </div>

      {/* Left: 2 growth graphs + Right: Attendance bar */}
      <div className="row g-3 mb-3">
        <div className="col-12 col-lg-5">
          <MetricAreaChart
            title="Users Growth"
            data={usersGrowthData}
            stroke="#60a5fa"
            fill="rgba(96,165,250,0.22)"
          />
          <MetricAreaChart
            title="Subscriptions"
            data={subscriptionsData}
            stroke="#34d399"
            fill="rgba(52,211,153,0.20)"
          />
        </div>

        <div className="col-12 col-lg-7">
          <div className="p-3 h-100" style={cardGlass}>
            <div className="text-center mb-2">
              <div style={titleText} className="fw-semibold">
                Attendance Report
              </div>
              <div className="small" style={mutedText}>
                Daily check-in vs check-out activity
              </div>
            </div>

            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={attendanceBarData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.55)" tick={{ fontSize: 12 }} />
                  <YAxis stroke="rgba(255,255,255,0.55)" tick={{ fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{
                      background: "rgba(0,0,0,0.85)",
                      border: "1px solid rgba(255,255,255,0.15)",
                    }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend />
                  <Bar dataKey="check_in" name="Check-ins" fill="#60a5fa" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="check_out" name="Check-outs" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="small mt-2" style={mutedText}>
              * Attendance bars come from API: <code>labels/check_ins/check_outs</code>.
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 mb-3">
        <div className="col-12">
          <MetricAreaChart
            title="Trainer Bookings"
            data={trainerBookingsData}
            stroke="#fb923c"
            fill="rgba(251,146,60,0.20)"
          />
        </div>
        <div className="col-12">
          <MetricAreaChart
            title="Boxing Bookings"
            data={boxingBookingsData}
            stroke="#a78bfa"
            fill="rgba(167,139,250,0.22)"
          />
        </div>
      </div>

      {/* Export (ONLY Excel + JSON) */}
      <div className="p-3" style={cardGlass}>
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2">
          <div>
            <div style={titleText} className="fw-semibold">
              Export Report
            </div>
            <div className="small" style={mutedText}>
              Download attendance report for selected date range.
            </div>
          </div>

          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-outline-light" onClick={exportExcel}>
              Export Excel
            </button>
            <button className="btn btn-outline-light" onClick={exportJson}>
              Export JSON
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
