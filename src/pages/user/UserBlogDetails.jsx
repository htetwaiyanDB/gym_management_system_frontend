import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";

function getServerOrigin() {
  const apiBase =
    import.meta.env.VITE_API_URL || "https://api.unityfitnessmyanmar.online/api";
  return apiBase.replace(/\/api\/?$/, "");
}

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
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;

  const origin = getServerOrigin();
  const cleaned = raw.replace(/^\/+/, "");

  if (cleaned.startsWith("storage/")) return `${origin}/${cleaned}`;
  if (cleaned.startsWith("blogs/")) return `${origin}/storage/${cleaned}`;
  if (raw.startsWith("/storage/")) return `${origin}${raw}`;

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

export default function UserBlogDetails() {
  const { id } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const blog = useMemo(() => location?.state?.blog || null, [location]);

  const img = blog ? resolveBlogImage(blog) : null;
  const [failed, setFailed] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);

  useEffect(() => {
    if (!showImageViewer) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setShowImageViewer(false);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showImageViewer]);

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
            aspectRatio: "16 / 9",
            minHeight: 170,
            maxHeight: 240,
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
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                background: "#0d0d0e",
                cursor: "zoom-in",
              }}
              loading="lazy"
              onError={() => setFailed(true)}
              onClick={() => setShowImageViewer(true)}
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
      </div>

      {showImageViewer && img ? (
        <div
          onClick={() => setShowImageViewer(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.9)",
            zIndex: 2000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
          }}
        >
          <button
            type="button"
            onClick={() => setShowImageViewer(false)}
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              border: "1px solid rgba(255,255,255,0.28)",
              background: "rgba(255,255,255,0.12)",
              color: "#fff",
              borderRadius: 10,
              padding: "6px 10px",
              cursor: "pointer",
            }}
          >
            Close
          </button>

          <img
            src={img}
            alt={title}
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "100%",
              maxHeight: "100%",
              width: "auto",
              height: "auto",
              objectFit: "contain",
              borderRadius: 10,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
