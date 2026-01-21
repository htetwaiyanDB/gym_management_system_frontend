import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";

/* ---------- helpers ---------- */

function looksLikeBlogItem(x) {
  if (!x || typeof x !== "object") return false;
  // Common blog fields
  return (
    typeof x.title === "string" ||
    typeof x.name === "string" ||
    typeof x.summary === "string" ||
    typeof x.content === "string" ||
    typeof x.body === "string"
  );
}

function findBlogArrayDeep(payload) {
  // 1) direct common keys
  const candidates = [
    payload?.blogs,
    payload?.latest_blogs,
    payload?.latestBlogs,
    payload?.posts,
    payload?.articles,
    payload?.data,
    payload?.data?.blogs,
    payload?.data?.latest_blogs,
    payload?.data?.posts,
    payload?.data?.data,
    payload?.data?.data?.blogs,
    payload?.data?.data?.latest_blogs,
    payload?.home,
    payload?.home?.blogs,
    payload?.home?.latest_blogs,
  ];

  for (const c of candidates) {
    if (Array.isArray(c) && c.some(looksLikeBlogItem)) return c;
  }

  // 2) if payload itself is array
  if (Array.isArray(payload) && payload.some(looksLikeBlogItem)) return payload;

  // 3) deep search (walk objects/arrays and return first blog-like array)
  const seen = new Set();

  const walk = (node) => {
    if (!node || typeof node !== "object") return null;
    if (seen.has(node)) return null;
    seen.add(node);

    if (Array.isArray(node)) {
      if (node.some(looksLikeBlogItem)) return node;
      for (const item of node) {
        const found = walk(item);
        if (found) return found;
      }
      return null;
    }

    // object
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (Array.isArray(v) && v.some(looksLikeBlogItem)) return v;
    }
    for (const k of Object.keys(node)) {
      const found = walk(node[k]);
      if (found) return found;
    }
    return null;
  };

  return walk(payload) || [];
}

function normalizeBlogList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.blogs)) return payload.blogs;
  if (Array.isArray(payload?.posts)) return payload.posts;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;
  return findBlogArrayDeep(payload);
}


function getServerOrigin() {
  const apiBase =
    import.meta.env.VITE_API_URL || "https://api.unityfitnessmyanmar.online/api";
  return apiBase.replace(/\/api\/?$/, "");
}

function isPlaceholderImage(value) {
  if (!value) return true;
  const t = String(value).trim().toLowerCase();
  return (
    t === "attach photo" ||
    t === "attach image" ||
    t === "no image" ||
    t === "null"
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
        blog?.image_url ||
        blog?.cover_image ||
        blog?.image ||
        blog?.thumbnail ||
        blog?.photo
    ) ||
    buildImageUrl(
      blog?.cover_image_path || blog?.image_path || blog?.thumbnail_path
    )
  );
}

function mergeBlogImages(base, source) {
  if (!source || resolveBlogImage(base)) return base;

  const imageFields = [
    "cover_image_url",
    "image_url",
    "cover_image",
    "image",
    "thumbnail",
    "photo",
    "cover_image_path",
    "image_path",
    "thumbnail_path",
    "coverImageUrl",
    "imageUrl",
    "coverImagePath",
    "coverImage",
  ];

  const merged = { ...base };
  for (const field of imageFields) {
    if (!merged?.[field] && source?.[field]) {
      merged[field] = source[field];
    }
  }
  return merged;
}


function getBlogId(blog, idx) {
  return blog?.id ?? blog?.blog_id ?? blog?.post_id ?? idx;
}

function getBlogTitle(blog) {
  return blog?.title || blog?.name || "Untitled";
}

function getBlogSummary(blog) {
  return blog?.summary || blog?.excerpt || "";
}

function getBlogDate(blog) {
  return blog?.published_at || blog?.publish_date || blog?.created_at || blog?.updated_at || "";
}

/* ---------- component ---------- */

export default function UserHome() {
  const navigate = useNavigate();

  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError("");

       const [homeRes, blogsRes] = await Promise.allSettled([
          axiosClient.get("/user/home"),
          axiosClient.get("/blogs"),
        ]);

       const homeData =
          homeRes.status === "fulfilled" ? homeRes.value?.data : null;
       const blogsData =
          blogsRes.status === "fulfilled" ? blogsRes.value?.data : null;

       const homeList = normalizeBlogList(homeData);
       const blogsList = normalizeBlogList(blogsData);

        const blogById = new Map(
          blogsList.map((blog, idx) => [getBlogId(blog, idx), blog])
        );

       const list = homeList.map((blog, idx) =>
          mergeBlogImages(blog, blogById.get(getBlogId(blog, idx)))
        );

        const sorted = [...list].sort((a, b) => {
          const da = new Date(getBlogDate(a) || 0).getTime();
          const db = new Date(getBlogDate(b) || 0).getTime();
          return db - da;
        });

        if (alive) setBlogs(sorted);
      } catch (e) {
        console.log("GET /user/home ERROR:", e?.response?.data || e);
        if (alive) {
          const status = e?.response?.status;
          if (status === 401) {
            setError("Unauthorized. Please login again.");
          } else {
            setError(e?.response?.data?.message || "Failed to load blogs.");
          }
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  const emptyText = useMemo(() => {
    if (loading) return "";
    if (error) return "";
    return "No blogs available.";
  }, [loading, error]);

  return (
    <div>
      <h2 style={{ marginBottom: 12 }}>User Home</h2>

      <h3 style={{ marginBottom: 10, fontSize: 16 }}>Blogs</h3>

      {loading && <p>Loading blogs...</p>}

      {!loading && error && (
        <div className="alert alert-danger" style={{ fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!loading && !error && blogs.length === 0 && <p>{emptyText}</p>}

      <div style={{ display: "grid", gap: 12 }}>
        {blogs.map((blog, idx) => {
          const id = getBlogId(blog, idx);
          const title = getBlogTitle(blog);
          const summary = getBlogSummary(blog);
          const image = resolveBlogImage(blog);
          const date = getBlogDate(blog);

          return (
            <div
              key={id}
              style={{
                border: "1px solid rgba(255,255,255,0.12)",
                borderRadius: 14,
                overflow: "hidden",
                background: "rgba(255,255,255,0.06)",
              }}
            >
              <div
                style={{
                  height: 160,
                  background: "rgba(255,255,255,0.04)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {image ? (
                  <img
                    src={image}
                    alt={title}
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span style={{ fontSize: 13, opacity: 0.75 }}>No image</span>
                )}
              </div>

              <div style={{ padding: 14 }}>
                <div className="d-flex justify-content-between" style={{ gap: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 16 }}>{title}</h4>
                  {date ? (
                    <span style={{ fontSize: 12, opacity: 0.75, whiteSpace: "nowrap" }}>
                      {String(date).slice(0, 10)}
                    </span>
                  ) : null}
                </div>

                <p style={{ marginTop: 8, opacity: 0.85 }}>
                  {summary
                    ? summary.length > 120
                      ? summary.slice(0, 120) + "..."
                      : summary
                    : "Tap read more to see details."}
                </p>

                <button
                  onClick={() =>
                    navigate(`/user/blogs/${id}`, { state: { blog } })
                  }
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid rgba(255,255,255,0.18)",
                    background: "rgba(255,255,255,0.10)",
                    color: "#fff",
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
