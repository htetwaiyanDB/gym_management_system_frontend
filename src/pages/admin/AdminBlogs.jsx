import React, { useEffect, useMemo, useState } from "react";
import axiosClient, { clearRequestCache } from "../../api/axiosClient";

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.blogs)) return payload.blogs;
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

// Video list shows: "Jan 11, 2026"
function formatDateShort(s) {
  const d = parseBackendDateTime(s);
  if (!d) return "-";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
}

function nowIsoLocal() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function computeStatus(post) {
  // expected fields from admin API:
  // - published_at (nullable)
  // - is_published boolean (optional)
  // - status string (optional)
  const status = (post?.status || "").toLowerCase();

  if (status === "published") return "published";
  if (status === "draft") return "draft";
  if (status === "scheduled") return "scheduled";

  const publishedAt = parseBackendDateTime(post?.published_at);
  if (!publishedAt) return "draft";
  const now = new Date();
  if (publishedAt.getTime() > now.getTime()) return "scheduled";
  return "published";
}

function statusBadge(status) {
  const s = String(status || "").toLowerCase();
  if (s === "published") return <span className="badge rounded-pill bg-success-subtle text-success">Published</span>;
  if (s === "scheduled") return <span className="badge rounded-pill bg-warning-subtle text-warning">Scheduled</span>;
  return <span className="badge rounded-pill bg-secondary-subtle text-secondary">Draft</span>;
}

function resolveCoverUrl(post) {
  return (
    post?.cover_image_url ||
    post?.cover_image ||
    post?.cover ||
    post?.image_url ||
    post?.image ||
    null
  );
}

<<<<<<< HEAD

=======
>>>>>>> 0b4c2688226468e6896cd2200fe4c77e957f01d9
export default function AdminBlogs() {
  // view: "list" | "form"
  const [view, setView] = useState("list");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState(null);
  const [blogs, setBlogs] = useState([]);

  // form mode
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");

  const [publishImmediately, setPublishImmediately] = useState(false);
  const [publishDate, setPublishDate] = useState(""); // datetime-local

  const [coverFile, setCoverFile] = useState(null);
  const [coverPreview, setCoverPreview] = useState(null);
  const [currentCoverUrl, setCurrentCoverUrl] = useState(null);

  const getPublishDateValue = () => {
    if (publishDate) return publishDate;
    if (publishImmediately) return nowIsoLocal();
    return "";
  };

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setSummary("");
    setContent("");
    setPublishImmediately(false);
    setPublishDate("");
    setCoverFile(null);
    setCoverPreview(null);
    setCurrentCoverUrl(null);
  };

  const openCreate = () => {
    setMsg(null);
    resetForm();
    setView("form");
  };

  const openEdit = (post) => {
    setMsg(null);
    setEditingId(post?.id ?? null);
    setTitle(safeText(post?.title));
    setSummary(safeText(post?.summary));
    setContent(safeText(post?.content));

    // If published_at exists, set publishDate for editing display (optional)
    const d = parseBackendDateTime(post?.published_at);
    if (d) {
      // convert to local datetime-local format
      const pad = (n) => String(n).padStart(2, "0");
      const local =
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
        `T${pad(d.getHours())}:${pad(d.getMinutes())}`;
      setPublishDate(local);
    } else {
      setPublishDate("");
    }

    setPublishImmediately(false);
    setCoverFile(null);
    setCoverPreview(null);

    // cover url from backend admin API (recommend: cover_image_url)
<<<<<<< HEAD
       setCurrentCoverUrl(resolveCoverUrl(post));

=======
    setCurrentCoverUrl(resolveCoverUrl(post));
    
>>>>>>> 0b4c2688226468e6896cd2200fe4c77e957f01d9
    setView("form");
  };

  const loadBlogs = async () => {
    setMsg(null);
    setLoading(true);
    try {
      // admin blogs list (must include drafts)
      const res = await axiosClient.get("/blogs", { cache: false });
      setBlogs(normalizeList(res.data));
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to load blog posts." });
    } finally {
      setLoading(false);
    }
  };

  const onPickCover = (file) => {
    setCoverFile(file || null);
    if (!file) {
      setCoverPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const submit = async (e) => {
    e.preventDefault();
    setMsg(null);

    // simple required fields (browser also validates)
    if (!title.trim() || !summary.trim() || !content.trim()) {
      setMsg({ type: "danger", text: "Please fill out Title, Summary, and Content." });
      return;
    }

    setSaving(true);
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("summary", summary.trim());
      form.append("content", content.trim());

      // publish workflow like video:
      // - checkbox "Publish immediately"
      // - Publish Date (optional)
      form.append("publish_immediately", publishImmediately ? "1" : "0");
     const effectivePublishDate = getPublishDateValue();
      if (effectivePublishDate) {
        // send as ISO-ish string; backend can parse
    form.append("publish_date", effectivePublishDate);
      }

<<<<<<< HEAD
      if (coverFile) {
=======
       if (coverFile) {
>>>>>>> 0b4c2688226468e6896cd2200fe4c77e957f01d9
        form.append("cover_image", coverFile);
        form.append("image", coverFile);
      }

      if (editingId) {
        await axiosClient.post(`/blogs/${editingId}?_method=PUT`, form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setMsg({ type: "success", text: "Blog post updated successfully." });
      } else {
        await axiosClient.post("/blogs", form, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setMsg({ type: "success", text: "Blog post created successfully." });
      }

      clearRequestCache();

      // go back to list
      setView("list");
      resetForm();
      await loadBlogs();
    } catch (e2) {
      const apiMsg = e2?.response?.data?.message;
      const errors = e2?.response?.data?.errors;
      const firstErr =
        errors && typeof errors === "object"
          ? Object.values(errors)?.flat()?.[0]
          : null;

      setMsg({
        type: "danger",
        text: apiMsg || firstErr || "Failed to save blog post.",
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (post) => {
    const id = post?.id;
    if (!id) return;

    const ok = window.confirm("Delete this blog post?");
    if (!ok) return;

    setMsg(null);
    try {
      await axiosClient.delete(`/blogs/${id}`);
      setMsg({ type: "success", text: "Blog post deleted successfully." });
      clearRequestCache();
      await loadBlogs();
    } catch (e) {
      setMsg({ type: "danger", text: e?.response?.data?.message || "Failed to delete blog post." });
    }
  };

  useEffect(() => {
    loadBlogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sortedBlogs = useMemo(() => {
    const list = [...blogs];
    // show newest updated first like admin panels
    list.sort((a, b) => {
      const ta = parseBackendDateTime(a?.updated_at)?.getTime() ?? 0;
      const tb = parseBackendDateTime(b?.updated_at)?.getTime() ?? 0;
      return tb - ta;
    });
    return list;
  }, [blogs]);

  // ---------- UI ----------
  if (view === "form") {
    return (
      <div className="admin-card p-4">
        <div className="d-flex align-items-start justify-content-between mb-3">
          <div>
            <h4 className="mb-1">{editingId ? "Edit Blog Post" : "Create Blog Post"}</h4>
          </div>
        </div>

        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div className="row justify-content-center">
          <div className="col-12 col-lg-8">
            <div
              className="card"
              style={{
                background: "rgba(10, 1, 1, 0.72)",
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 10,
              }}
            >
              <div className="card-body p-4">
                <form onSubmit={submit}>
                  <div className="mb-3">
                    <label className="form-label fw-bold">Title</label>
                    <input
                      className="form-control"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      required
                      placeholder="Title"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Summary</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={summary}
                      onChange={(e) => setSummary(e.target.value)}
                      required
                      placeholder="Summary"
                    />
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-bold">Content</label>
                    <textarea
                      className="form-control"
                      rows={8}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      required
                      placeholder="content"
                    />
                  </div>

                  <div className="mb-2">
                   <div className="small mb-2 text-light">
                        Current cover image
                        <div className="mt-2">
                          <img
                            src={currentCoverUrl}
                            alt="current cover"
                            style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8 }}
                          />
                        </div>

                    {currentCoverUrl ? (
                      <div className="small mb-2 text-light">
                        Current cover image
                        <div className="mt-2">
                          <img
                            src={currentCoverUrl}
                            alt="current cover"
                            style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 8 }}
                          />
                        </div>
                        
                      </div>
                    ) : null}

                    <input
                      type="file"
                      className="form-control"
                      accept="image/*"
                      onChange={(e) => onPickCover(e.target.files?.[0] || null)}
                    />
                    <div className="small text-light mt-1">Image will be resized to 1200x627.</div>

                    <div className="mt-2">
                      <div className="small text-light fw-semibold mb-1">Preview</div>
                      <div
                        style={{
                          border: "1px solid rgba(0,0,0,0.08)",
                          borderRadius: 8,
                          height: 170,
                          overflow: "hidden",
                          background: "#0d0d0ed7",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {coverPreview ? (
                          <img
                            src={coverPreview}
                            alt="cover preview"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
<<<<<<< HEAD
                           ) : currentCoverUrl ? (
=======
                        ) : currentCoverUrl ? (
>>>>>>> 0b4c2688226468e6896cd2200fe4c77e957f01d9
                          <img
                            src={currentCoverUrl}
                            alt="current cover"
                            style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          />
                        ) : (
                          <div className="text-light">Cover image preview</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-2 mt-3">
                    <input
                      className="form-check-input text-light"
                      type="checkbox"
                      id="publishImmediately"
                      checked={publishImmediately}
                     onChange={(e) => {
                        const checked = e.target.checked;
                        setPublishImmediately(checked);
                        if (checked && !publishDate) {
                          setPublishDate(nowIsoLocal());
                        }
                      }}
                    />
                    <label className="form-check-label text-light" htmlFor="publishImmediately">
                      Publish immediately
                    </label>
                  </div>

                  <div className="mt-3">
                    <label className="form-label text-light fw-semibold">Publish Date (optional)</label>
                    <input
                      type="datetime-local"
                      className="form-control"
                      value={publishDate}
                      onChange={(e) => setPublishDate(e.target.value)}
                      placeholder={nowIsoLocal()}
                    />
                  </div>

                  <div className="d-flex align-items-center gap-3 mt-4">
                    <button className="btn btn-success px-4" type="submit" disabled={saving}>
                      {saving ? "Saving..." : "SAVE BLOG POST"}
                    </button>

                    <button
                      type="button"
                      className="btn btn-link text-decoration-none"
                      onClick={() => {
                        setView("list");
                        // keep msg so success shows on list like video
                      }}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>

            
          </div>
        </div>
      </div>
    );
  }

  // LIST VIEW
  return (
    <div className="admin-card p-4">
      {/* success banner like video */}
      {msg?.type === "success" ? (
        <div className="alert alert-success">{msg.text}</div>
      ) : msg ? (
        <div className={`alert alert-${msg.type}`}>{msg.text}</div>
      ) : null}

      <div className="d-flex align-items-start justify-content-between mb-3">
        <div>
          <h4 className="mb-1">Blog Management</h4>
          <div className="admin-muted">
            Create and manage blog posts for members and trainers.
          </div>
        </div>

        <div className="d-flex gap-2">
          <button className="btn btn-outline-light" onClick={loadBlogs} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button className="btn btn-success" onClick={openCreate}>
            NEW BLOG POST
          </button>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-dark table-hover align-middle mb-0">
          <thead>
            <tr>
              <th>Title</th>
              <th style={{ width: 150 }}>Status</th>
              <th style={{ width: 170 }}>Published At</th>
              <th style={{ width: 170 }}>Updated</th>
              <th style={{ width: 170 }}>Actions</th>
            </tr>
          </thead>

          <tbody>
            {sortedBlogs.length === 0 ? (
              <tr>
                <td colSpan="5" className="text-center text-muted py-4">
                  {loading ? "Loading..." : "No blog posts created yet."}
                </td>
              </tr>
            ) : (
              sortedBlogs.map((post) => {
                const st = computeStatus(post);
                return (
                  <tr key={post?.id}>
                    <td>
                      <div className="fw-semibold text-white">{safeText(post?.title)}</div>
                      {post?.summary ? (
                        <div className="text-light small" style={{ maxWidth: 640 }}>
                          {safeText(post.summary).slice(0, 90)}
                          {safeText(post.summary).length > 90 ? "..." : ""}
                        </div>
                      ) : null}
                    </td>

                    <td>{statusBadge(st)}</td>

                    <td className="text-light">{formatDateShort(post?.published_at)}</td>

                    <td className="text-light">{formatDateShort(post?.updated_at)}</td>

                    <td>
                      <div className="d-flex gap-2">
                        <button className="btn btn-primary btn-sm" onClick={() => openEdit(post)}>
                          Edit
                        </button>
                        <button className="btn btn-danger btn-sm" onClick={() => remove(post)}>
                          Delete
                        </button>
                      </div>
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
