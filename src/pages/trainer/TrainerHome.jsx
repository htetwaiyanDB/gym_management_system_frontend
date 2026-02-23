import { memo, useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getBlogs } from "../../api/trainerApi";
import useRealtimePolling from "../../hooks/useRealtimePolling";
import "./TrainerHome.css";

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

const BlogCardImage = memo(function BlogCardImage({ src, alt }) {
  const [failed, setFailed] = useState(false);

  return (
    <div className="trainer-home-blog-image-wrap">
      {src && !failed ? (
        <img
          src={src}
          alt={alt}
          className="trainer-home-blog-image"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="trainer-home-blog-empty-image">
          {src ? "Image failed to load" : "No image"}
        </span>
      )}
    </div>
  );
});

export default function TrainerHome() {
  const navigate = useNavigate();
  const blogsSignatureRef = useRef("");
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

      const signature = sorted
        .map((blog, idx) => {
          const id = blog?.id ?? idx;
          const date = blog?.published_at || blog?.publish_date || blog?.updated_at || "";
          const title = blog?.title || "Untitled";
          return `${id}:${date}:${title}`;
        })
        .join("|");

      if (signature !== blogsSignatureRef.current) {
        blogsSignatureRef.current = signature;
        setBlogs(sorted);
      }
    } catch (e) {
      setErr(e?.response?.data?.message || "Failed to load blogs.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtimePolling(fetchBlogs, 15000, []);

  return (
    <div>
      <h2 className="trainer-home-title">Unity Fitness</h2>

      <h3 className="trainer-home-subtitle">Blogs</h3>

      {loading && <p>Loading blogs...</p>}
      {!loading && err && <p className="trainer-home-error">{err}</p>}
      {!loading && !err && blogs.length === 0 && <p>No blogs available.</p>}

      <div className="trainer-home-blog-grid">
        {blogs.map((b) => {
          const id = b?.id;
          const title = b?.title || "Untitled";
          const summary = b?.summary || "";
          const img = resolveBlogImage(b);
          const date = b?.published_at || b?.publish_date || b?.updated_at || "";

          return (
            <div key={id || title} className="trainer-home-blog-card">
              {/* ✅ always render image area, show placeholder if missing/failed */}
              <BlogCardImage src={img} alt={title} />

              <div className="trainer-home-blog-body">
                <div className="trainer-home-blog-header">
                  <h4 className="trainer-home-blog-title">{title}</h4>
                  {date ? (
                    <span className="trainer-home-blog-date">
                      {String(date).slice(0, 10)}
                    </span>
                  ) : null}
                </div>

                <p className="trainer-home-blog-summary">
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
                  className="trainer-home-blog-btn"
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
