import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBlogs } from "../../api/trainerApi";
import useRealtimePolling from "../../hooks/useRealtimePolling";

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.blogs)) return payload.blogs;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return [];
}

function getServerOrigin() {
  const apiBase =
    import.meta.env.VITE_API_URL || "https://api.unityfitnessmyanmar.online/api";
  return apiBase.replace(/\/api\/?$/, "");
}

/**
 * ✅ Works with your JSON:
 *  cover_image_url: "https://api.unityfitnessmyanmar.online/storage/blogs/..jpg"
 *
 * ✅ Also works with DB field screenshot:
 *  cover_image_path: "blogs/xxx.png"  ->  <origin>/storage/blogs/xxx.png
 *
 * Also supports common variants just in case.
 */
function isPlaceholderImage(value) {
  if (!value) return true;
  const text = String(value).trim().toLowerCase();
  return (
    text === "attach photo" ||
    text === "attach image" ||
    text === "no image" ||
    text === "null"
  );
}

function buildImageUrl(value) {
  if (!value || isPlaceholderImage(value)) return null;
  const raw = String(value).trim();
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    return raw;
  }

  const origin = getServerOrigin();
  const cleaned = raw.replace(/^\/+/, "");

  if (cleaned.startsWith("storage/")) {
    return `${origin}/${cleaned}`;
  }

 if (cleaned.startsWith("blogs/")) {
    return `${origin}/storage/${cleaned}`;
  }

    if (raw.startsWith("/storage/")) {
    return `${origin}${raw}`;
  }

  return `${origin}/storage/${cleaned}`;
}

function resolveBlogImage(blog) {
  return (
    buildImageUrl(
      blog?.cover_image_url ||
        blog?.coverImageUrl ||
        blog?.image_url ||
        blog?.imageUrl
    ) ||
    buildImageUrl(
      blog?.cover_image_path ||
        blog?.coverImagePath ||
        blog?.cover_image ||
        blog?.coverImage ||
        blog?.image ||
        blog?.image_path
    )
  );
}

function BlogCardImage({ src, alt }) {
  const [failed, setFailed] = useState(false);

  return (
    <div
      style={{
        width: "100%",
        height: 160,
        overflow: "hidden",
        background: "rgba(255,255,255,0.04)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span style={{ fontSize: 13, opacity: 0.75 }}>
          {src ? "Image failed to load" : "No image"}
        </span>
      )}
    </div>
  );
}

export default function TrainerHome() {
  const navigate = useNavigate();
  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const fetchBlogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setErr("");

      const res = await getBlogs();
      const list = normalizeList(res.data);
      const sorted = [...list].sort((a, b) => {
        const da = new Date(a?.published_at || a?.publish_date || a?.updated_at || 0).getTime();
        const db = new Date(b?.published_at || b?.publish_date || b?.updated_at || 0).getTime();
        return db - da;
      });

      setBlogs(sorted);
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to load blogs.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtimePolling(fetchBlogs, 15000, []);

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>Trainer Dashboard</h2>

      <h3 style={{ marginBottom: 10, fontSize: 16 }}>Blogs</h3>

      {loading && <p>Loading blogs...</p>}
      {!loading && err && <p style={{ color: "#ffb4b4" }}>{err}</p>}
      {!loading && !err && blogs.length === 0 && <p>No blogs available.</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {blogs.map((b) => {
          const id = b?.id;
          const title = b?.title || "Untitled";
          const summary = b?.summary || "";
          const img = resolveBlogImage(b);
          const date = b?.published_at || b?.publish_date || b?.updated_at || "";

          return (
            <div
              key={id || title}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                overflow: "hidden",
                background: "rgba(255,255,255,0.06)",
                backdropFilter: "blur(10px)",
              }}
            >
              {/* ✅ always render image area, show placeholder if missing/failed */}
              <BlogCardImage src={img} alt={title} />

              <div style={{ padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 16 }}>{title}</h4>
                  {date ? (
                    <span style={{ fontSize: 12, opacity: 0.75, whiteSpace: "nowrap" }}>
                      {String(date).slice(0, 10)}
                    </span>
                  ) : null}
                </div>

                <p style={{ marginTop: 8, marginBottom: 12, opacity: 0.85 }}>
                  {summary
                    ? summary.length > 120
                      ? summary.slice(0, 120) + "..."
                      : summary
                    : "Tap read more to view details."}
                </p>

                {/* OPTIONAL debug: uncomment to see computed url in UI */}
                {/* <p style={{ fontSize: 11, opacity: 0.6, wordBreak: "break-all" }}>{img || "no image url"}</p> */}

                <button
                  onClick={() => {
                    if (!id) return;
                    navigate(`/trainer/blogs/${id}`, { state: { blog: b } });
                  }}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.10)",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 600,
                  }}
                >
                  Read more
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
