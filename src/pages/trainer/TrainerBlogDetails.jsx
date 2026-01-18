import { useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

function getServerOrigin() {
  const apiBase =
    import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";
  return apiBase.replace(/\/api\/?$/, "");
}

function resolveBlogImage(blog) {
  const url =
    blog?.cover_image_url ||
    blog?.coverImageUrl ||
    blog?.image_url ||
    blog?.imageUrl ||
    null;

  if (url && (String(url).startsWith("http://") || String(url).startsWith("https://"))) {
    return String(url);
  }

  const path =
    blog?.cover_image_path ||
    blog?.coverImagePath ||
    blog?.cover_image ||
    blog?.coverImage ||
    null;

  if (path) {
    const p = String(path).replace(/^\/+/, "");
    return `${getServerOrigin()}/storage/${p}`;
  }

  return null;
}

export default function TrainerBlogDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const blog = useMemo(() => location?.state?.blog || null, [location]);

  const img = blog ? resolveBlogImage(blog) : null;
  const [failed, setFailed] = useState(false);

  if (!blog) {
    return (
      <div>
        <button
          onClick={() => nav(-1)}
          style={{
            marginBottom: 12,
            padding: "8px 12px",
            borderRadius: 12,
            border: "1px solid rgba(255,255,255,0.18)",
            background: "rgba(255,255,255,0.08)",
            color: "#fff",
            cursor: "pointer",
          }}
        >
          Back
        </button>

        <p style={{ color: "#ffb4b4" }}>
          Blog details not available (page refreshed or opened directly).
        </p>
        <p style={{ opacity: 0.85 }}>Please go back and open the blog again.</p>

        <p style={{ opacity: 0.7, marginTop: 10 }}>
          Missing blog for id: <b>{id}</b>
        </p>
      </div>
    );
  }

  const title = blog?.title || "Blog";
  const date = blog?.published_at || blog?.publish_date || blog?.updated_at || "";
  const summary = blog?.summary || "";
  const content = blog?.content || "";

  return (
    <div>
      <button
        onClick={() => nav(-1)}
        style={{
          marginBottom: 12,
          padding: "8px 12px",
          borderRadius: 12,
          border: "1px solid rgba(255,255,255,0.18)",
          background: "rgba(255,255,255,0.08)",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        Back
      </button>

      <div>
        <h2 style={{ marginTop: 0 }}>{title}</h2>

        {date ? (
          <p style={{ opacity: 0.8, marginTop: 6 }}>
            {String(date).slice(0, 10)}
          </p>
        ) : null}

        <div
          style={{
            width: "100%",
            height: 220,
            overflow: "hidden",
            borderRadius: 14,
            marginTop: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {img && !failed ? (
            <img
              src={img}
              alt={title}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
              onError={() => setFailed(true)}
            />
          ) : (
            <span style={{ fontSize: 13, opacity: 0.75 }}>
              {img ? "Image failed to load" : "No image"}
            </span>
          )}
        </div>

        {summary ? (
          <p style={{ marginTop: 12, opacity: 0.9, lineHeight: 1.6 }}>
            {summary}
          </p>
        ) : null}

        <div
          style={{
            marginTop: 14,
            lineHeight: 1.7,
            opacity: 0.92,
            whiteSpace: "pre-wrap",
          }}
        >
          {content || "No content available."}
        </div>

        {/* OPTIONAL debug (uncomment): */}
        {/* <p style={{ fontSize: 11, opacity: 0.6, wordBreak: "break-all" }}>{img || "no image url"}</p> */}
      </div>
    </div>
  );
}
