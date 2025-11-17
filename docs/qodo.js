const OWNER = "3WJR2";
const REPO = "qodo_chevron_demo_repo";
const API_BASE = `https://api.github.com/repos/${OWNER}/${REPO}`;

const els = {
  status: document.getElementById("statusBanner"),
  prList: document.getElementById("prList"),
  stateFilter: document.getElementById("stateFilter"),
  search: document.getElementById("searchInput"),
  token: document.getElementById("tokenInput"),
  prState: document.getElementById("prState"),
  prTitle: document.getElementById("prTitle"),
  prMeta: document.getElementById("prMeta"),
  prLinks: document.getElementById("prLinks"),
  prLink: document.getElementById("prLink"),
  diffLink: document.getElementById("diffLink"),
  messages: document.getElementById("qodoMessages"),
  diffTitle: document.getElementById("diffTitle"),
  diffTotals: document.getElementById("diffTotals"),
  diffFiles: document.getElementById("diffFiles"),
  diffViewer: document.getElementById("diffViewer"),
};

const state = {
  prs: [],
  filtered: [],
  active: null,
  diffFiles: [],
  activeDiffFile: null,
};

function setStatus(message, tone = "info") {
  els.status.textContent = message;
  els.status.className = `status tone-${tone}`;
}

async function ghFetch(path, options = {}) {
  const { token, query = {}, mediaType } = options;
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  const headers = {
    Accept: mediaType ?? "application/vnd.github+json",
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  const response = await fetch(url.toString(), { headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${response.status}: ${text}`);
  }
  return response.json();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function formatPatch(patch) {
  if (!patch) {
    return "";
  }
  return patch
    .split("\n")
    .map((line) => {
      const escaped = escapeHtml(line);
      let cls = "ctx";
      if (line.startsWith("+")) cls = "add";
      else if (line.startsWith("-")) cls = "del";
      else if (line.startsWith("@@")) cls = "hunk";
      return `<span class="diff-line ${cls}">${escaped || "&nbsp;"}</span>`;
    })
    .join("");
}

const ALLOWED_TAGS = new Set([
  "p",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "br",
  "code",
  "pre",
  "blockquote",
  "ul",
  "ol",
  "li",
  "table",
  "thead",
  "tbody",
  "tr",
  "td",
  "th",
  "details",
  "summary",
  "a",
  "span",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
]);

const ALLOWED_ATTRS = {
  a: ["href", "title"],
  td: ["align", "colspan", "rowspan"],
  th: ["align", "colspan", "rowspan"],
  span: ["class"],
  code: ["class"],
  div: ["class"],
  summary: [],
  details: [],
};

function sanitizeHtmlFragment(html) {
  const template = document.createElement("template");
  template.innerHTML = html;

  const sanitizeNode = (node) => {
    [...node.childNodes].forEach((child) => {
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        return;
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          child.replaceWith(...child.childNodes);
          return;
        }
        const allowed = ALLOWED_ATTRS[tag] ?? [];
        [...child.attributes].forEach((attr) => {
          if (!allowed.includes(attr.name)) {
            child.removeAttribute(attr.name);
          }
        });
        if (tag === "a" && child.hasAttribute("href")) {
          child.setAttribute("target", "_blank");
          child.setAttribute("rel", "noopener");
        }
        sanitizeNode(child);
      }
    });
  };

  sanitizeNode(template.content);
  return template.innerHTML;
}

function renderPrList(prs) {
  if (!prs.length) {
    els.prList.innerHTML = '<div class="empty">No pull requests found.</div>';
    return;
  }

  els.prList.innerHTML = "";
  prs.forEach((pr) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "pr-item";
    item.dataset.number = pr.number;
    item.innerHTML = `
      <div class="state-pill" data-state="${pr.merged_at ? "merged" : pr.state}">
        #${pr.number} · ${pr.merged_at ? "merged" : pr.state}
      </div>
      <h3>${pr.title}</h3>
      <p>${pr.user.login} · updated ${new Date(pr.updated_at).toLocaleString()}</p>
    `;
    item.addEventListener("click", () => selectPr(pr));
    if (state.active && state.active.number === pr.number) {
      item.classList.add("active");
    }
    els.prList.appendChild(item);
  });
}

function filterPrs() {
  const needle = els.search.value.trim().toLowerCase();
  const stateFilter = els.stateFilter.value;

  state.filtered = state.prs.filter((pr) => {
    const matchesState =
      stateFilter === "all" ||
      (stateFilter === "closed" && (pr.state === "closed" || pr.merged_at)) ||
      pr.state === stateFilter;

    const matchesNeedle = !needle
      ? true
      : pr.title.toLowerCase().includes(needle) ||
        `#${pr.number}`.includes(needle);

    return matchesState && matchesNeedle;
  });

  renderPrList(state.filtered);

  if (!state.active && state.filtered.length) {
    selectPr(state.filtered[0]);
  }
}

async function loadPrs() {
  try {
    setStatus("Loading pull requests...");
    const token = els.token.value.trim();
    const prs = await ghFetch("pulls", {
      token,
      query: {
        per_page: 30,
        state: "all",
      },
    });
    state.prs = prs;
    filterPrs();
    setStatus("Pull requests loaded", "success");
  } catch (error) {
    console.error(error);
    setStatus("Failed to load pull requests", "alert");
    els.prList.innerHTML = `<div class="empty">${error.message}</div>`;
  }
}

function summarizePr(pr) {
  els.prState.dataset.state = pr.merged_at ? "merged" : pr.state;
  els.prState.textContent = pr.merged_at ? "Merged" : pr.state;
  els.prTitle.textContent = pr.title;
  els.prMeta.textContent = `Opened by ${pr.user.login} · ${new Date(
    pr.created_at,
  ).toLocaleString()} · ${pr.comments} comments`;
  els.prLink.href = pr.html_url;
  els.diffLink.href = `${pr.html_url}/files`;
  els.prLinks.hidden = false;
  els.diffTitle.textContent = pr.title;
}

function renderMessages(messages) {
  if (!messages.length) {
    els.messages.innerHTML = '<div class="empty">No Qodo feedback found.</div>';
    return;
  }

  els.messages.innerHTML = "";
  messages
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .forEach((msg) => {
      const card = document.createElement("article");
      card.className = "message-card";
      const label =
        msg.kind === "review"
          ? "Review"
          : msg.kind === "review_comment"
            ? "Diff comment"
            : "Issue comment";
      const pathLabel = msg.path
        ? `<span class="path">${escapeHtml(msg.path)}${msg.line ? `:${msg.line}` : ""}</span>`
        : "";
      const bodyHtml = msg.body_html
        ? sanitizeHtmlFragment(msg.body_html)
        : msg.body
          ? `<p>${escapeHtml(msg.body)}</p>`
          : '<p class="muted"><em>No comment body provided.</em></p>';
      const diffBlock = msg.diff_hunk
        ? `<div class="diff-viewer-dual">
             <pre class="diff-block">${formatPatch(msg.diff_hunk)}</pre>
             <pre class="diff-block">${formatPatch(msg.diff_hunk)}</pre>
           </div>`
        : "";
      const link = msg.html_url
        ? `<a class="message-link" href="${msg.html_url}" target="_blank" rel="noopener">Jump to GitHub</a>`
        : "";
      card.innerHTML = `
        <header class="message-header">
          <div class="chip kind-${msg.kind}">
            ${label}
            ${pathLabel}
          </div>
          <div class="message-meta">
            <span>@${msg.author}</span>
            <time>${new Date(msg.timestamp).toLocaleString()}</time>
          </div>
        </header>
        <div class="message-body gh-markdown">
          ${bodyHtml}
        </div>
        ${diffBlock}
        ${link}
      `;
      els.messages.appendChild(card);
    });
}

function isQodoEntry(entry) {
  const author = (entry.user?.login || "").toLowerCase();
  const body = (entry.body || entry.body_text || "").toLowerCase();
  return author.includes("qodo") || body.includes("qodo");
}

function normalizeEntry(entry, kind) {
  return {
    id: entry.id,
    kind,
    author: entry.user?.login ?? "unknown",
    body: entry.body ?? entry.body_text ?? "",
    body_html: entry.body_html ?? null,
    timestamp: entry.submitted_at || entry.created_at || entry.updated_at,
    path: entry.path,
    line: entry.original_line ?? entry.line ?? entry.position ?? null,
    html_url: entry.html_url,
    state: entry.state,
    diff_hunk: entry.diff_hunk,
  };
}

function renderDiffTotals(files) {
  const additions = files.reduce((sum, file) => sum + (file.additions || 0), 0);
  const deletions = files.reduce((sum, file) => sum + (file.deletions || 0), 0);
  els.diffTotals.textContent = `${files.length} file${files.length === 1 ? "" : "s"} · +${additions} / -${deletions}`;
}

function renderDiffFiles(files) {
  if (!files.length) {
    els.diffFiles.innerHTML = '<div class="empty">No file changes found.</div>';
    els.diffViewer.innerHTML = '<div class="empty">Nothing to preview.</div>';
    renderDiffTotals(files);
    return;
  }

  els.diffFiles.innerHTML = "";
  files.forEach((file) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "diff-file-btn";
    btn.dataset.filename = file.filename;
    btn.innerHTML = `
      <span class="file-label">
        <span class="file-icon" aria-hidden="true">▸</span>
        <span class="filename">${escapeHtml(file.filename)}</span>
      </span>
      <span class="stats">
        ${file.status}
        <span class="diff-chip add">+${file.additions}</span>
        <span class="diff-chip del">-${file.deletions}</span>
      </span>
    `;
    btn.addEventListener("click", () => selectDiffFile(file.filename));
    if (state.activeDiffFile === file.filename) {
      btn.classList.add("active");
    }
    els.diffFiles.appendChild(btn);
  });

  renderDiffTotals(files);
}

function renderDiffViewer(file) {
  if (!file) {
    els.diffViewer.innerHTML = '<div class="empty">Pick a file to preview the diff.</div>';
    return;
  }

  const statusMap = {
    modified: "Modified",
    added: "Added",
    removed: "Removed",
    renamed: "Renamed",
  };
  const statusLabel = statusMap[file.status] ?? file.status;
  const patch =
    file.patch && file.patch.trim().length
      ? `<div class="diff-viewer-dual">
          <pre class="diff-block">${formatPatch(file.patch)}</pre>
          <pre class="diff-block">${formatPatch(file.patch)}</pre>
        </div>`
      : '<div class="empty">Binary file or patch unavailable.</div>';
  const viewLink = file.blob_url
    ? `<a class="diff-action" href="${file.blob_url}" target="_blank" rel="noopener">View file</a>`
    : "";
  const rawLink = file.raw_url
    ? `<a class="diff-action" href="${file.raw_url}" target="_blank" rel="noopener">Raw</a>`
    : "";

  els.diffViewer.innerHTML = `
    <div class="diff-file-header">
      <div class="diff-file-meta">
        <span class="diff-file-path">${escapeHtml(file.filename)}</span>
        <span class="diff-file-status">${statusLabel}</span>
        <span class="diff-file-totals">
          <span class="add">+${file.additions}</span>
          <span class="del">-${file.deletions}</span>
        </span>
      </div>
      <div class="diff-file-actions">
        ${viewLink}
        ${rawLink}
      </div>
    </div>
    <div class="diff-scroll">
      ${patch}
    </div>
  `;
}

function selectDiffFile(filename) {
  state.activeDiffFile = filename;
  const file = state.diffFiles.find((entry) => entry.filename === filename);
  document
    .querySelectorAll(".diff-file-btn")
    .forEach((btn) => btn.classList.toggle("active", btn.dataset.filename === filename));
  renderDiffViewer(file);
}

async function loadDiff(pr) {
  try {
    const token = els.token.value.trim();
    const files = await ghFetch(`pulls/${pr.number}/files`, {
      token,
      query: { per_page: 100 },
    });
    state.diffFiles = files;
    state.activeDiffFile = files[0]?.filename ?? null;
    renderDiffFiles(files);
    if (state.activeDiffFile) {
      selectDiffFile(state.activeDiffFile);
    }
  } catch (error) {
    console.error(error);
    els.diffFiles.innerHTML = `<div class="empty">Unable to load diff: ${error.message}</div>`;
    els.diffViewer.innerHTML = '<div class="empty">Unable to show diff.</div>';
    els.diffTotals.textContent = "0 files · 0 changes";
  }
}

async function selectPr(pr) {
  state.active = pr;
  document
    .querySelectorAll(".pr-item")
    .forEach((el) => el.classList.toggle("active", +el.dataset.number === pr.number));

  summarizePr(pr);
  els.messages.innerHTML = '<div class="empty">Loading feedback...</div>';
  els.diffFiles.innerHTML = '<div class="empty">Loading diff…</div>';
  els.diffViewer.innerHTML = '<div class="empty">Loading diff…</div>';

  try {
    const token = els.token.value.trim();
    const htmlMediaType = "application/vnd.github.v3.html+json";
    const [reviews, reviewComments, issueComments] = await Promise.all([
      ghFetch(`pulls/${pr.number}/reviews`, { token, mediaType: htmlMediaType }),
      ghFetch(`pulls/${pr.number}/comments`, {
        token,
        query: { per_page: 100 },
        mediaType: htmlMediaType,
      }),
      ghFetch(`issues/${pr.number}/comments`, {
        token,
        query: { per_page: 100 },
        mediaType: htmlMediaType,
      }),
    ]);

    const combined = [
      ...reviews.filter(isQodoEntry).map((review) => normalizeEntry(review, "review")),
      ...reviewComments
        .filter(isQodoEntry)
        .map((comment) => normalizeEntry(comment, "review_comment")),
      ...issueComments.filter(isQodoEntry).map((comment) => normalizeEntry(comment, "issue_comment")),
    ];

    renderMessages(combined);
  } catch (error) {
    console.error(error);
    els.messages.innerHTML = `<div class="empty">Unable to load feedback: ${error.message}</div>`;
  }

  loadDiff(pr);
}

// Wire up controls
[els.stateFilter, els.search].forEach((input) => {
  input.addEventListener("input", () => filterPrs());
});

els.token.addEventListener("change", () => loadPrs());

loadPrs();
