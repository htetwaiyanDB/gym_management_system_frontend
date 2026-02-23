import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import axiosClient from "../../api/axiosClient";
import useRealtimePolling from "../../hooks/useRealtimePolling";
import "./UserHome.css";

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
  const blogsSignatureRef = useRef("");

  const [blogs, setBlogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const fetchBlogs = useCallback(async ({ silent = false } = {}) => {
    try {
      if (!silent) setLoading(true);
      setError("");

      const [homeRes, blogsRes] = await Promise.allSettled([
        axiosClient.get("/user/home"),
        axiosClient.get("/blogs"),
      ]);

      const homeData = homeRes.status === "fulfilled" ? homeRes.value?.data : null;
      const blogsData = blogsRes.status === "fulfilled" ? blogsRes.value?.data : null;

      const homeList = normalizeBlogList(homeData);
      const blogsList = normalizeBlogList(blogsData);

      const blogById = new Map(blogsList.map((blog, idx) => [getBlogId(blog, idx), blog]));
      const list = homeList.map((blog, idx) => mergeBlogImages(blog, blogById.get(getBlogId(blog, idx))));

      const sorted = [...list].sort((a, b) => {
        const da = new Date(getBlogDate(a) || 0).getTime();
        const db = new Date(getBlogDate(b) || 0).getTime();
        return db - da;
      });

      const signature = sorted
        .map((blog, idx) => {
          const id = getBlogId(blog, idx);
          const date = getBlogDate(blog) || "";
          const title = getBlogTitle(blog);
          return `${id}:${date}:${title}`;
        })
        .join("|");

      if (signature !== blogsSignatureRef.current) {
        blogsSignatureRef.current = signature;
        setBlogs(sorted);
      }
    } catch (e) {
      const status = e?.response?.status;
      if (status === 401) {
        setError("Unauthorized. Please login again.");
      } else {
        setError(e?.response?.data?.message || "Failed to load blogs.");
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useRealtimePolling(fetchBlogs, 15000, []);

  const emptyText = useMemo(() => {
    if (loading) return "";
    if (error) return "";
    return "No blogs available.";
  }, [loading, error]);

  return (
    <div>
      <h2 className="home-title">Unity Fitness</h2>

      <h3 className="home-subtitle">Blogs</h3>

      {loading && <p>Loading blogs...</p>}

      {!loading && error && (
        <div className="alert alert-danger" style={{ fontWeight: 600 }}>
          {error}
        </div>
      )}

      {!loading && !error && blogs.length === 0 && <p>{emptyText}</p>}

      <div className="home-blog-grid">
        {blogs.map((blog, idx) => {
          const id = getBlogId(blog, idx);
          const title = getBlogTitle(blog);
          const summary = getBlogSummary(blog);
          const image = resolveBlogImage(blog);
          const date = getBlogDate(blog);

          return (
            <div key={id} className="home-blog-card">
              <div className="home-blog-image-wrap">
                {image ? (
                  <img
                    src={image}
                    alt={title}
                    className="home-blog-image"
                    loading="lazy"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  <span className="home-blog-empty-image">No image</span>
                )}
              </div>

              <div className="home-blog-body">
                <div className="d-flex justify-content-between home-blog-header">
                  <h4 className="home-blog-title">{title}</h4>
                  {date ? (
                    <span className="home-blog-date">
                      {String(date).slice(0, 10)}
                    </span>
                  ) : null}
                </div>

                <p className="home-blog-summary">
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
                  className="home-blog-btn"
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
