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
};

const state = {
  prs: [],
  filtered: [],
  active: null,
};

function setStatus(message, tone = "info") {
  els.status.textContent = message;
  els.status.className = `status tone-${tone}`;
}

async function ghFetch(path, token, query = {}) {
  const url = new URL(`${API_BASE}/${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, value);
    }
  });
  const headers = {
    Accept: "application/vnd.github+json",
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
}

async function loadPrs() {
  try {
    setStatus("Loading pull requests...");
    const token = els.token.value.trim();
    const prs = await ghFetch("pulls", token, {
      per_page: 30,
      state: "all",
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
      card.innerHTML = `
        <header>
          <span>${msg.author}</span>
          <time>${new Date(msg.timestamp).toLocaleString()}</time>
        </header>
        <pre>${msg.body}</pre>
      `;
      els.messages.appendChild(card);
    });
}

function isQodoEntry(entry) {
  const author = (entry.user?.login || "").toLowerCase();
  const body = (entry.body || "").toLowerCase();
  return author.includes("qodo") || body.includes("qodo");
}

function normalizeEntry(entry) {
  return {
    id: entry.id,
    author: entry.user?.login ?? "unknown",
    body: entry.body ?? "",
    timestamp: entry.submitted_at || entry.created_at || entry.updated_at,
  };
}

async function selectPr(pr) {
  state.active = pr;
  document
    .querySelectorAll(".pr-item")
    .forEach((el) => el.classList.toggle("active", +el.dataset.number === pr.number));

  summarizePr(pr);
  els.messages.innerHTML = '<div class="empty">Loading feedback...</div>';

  try {
    const token = els.token.value.trim();
    const [reviews, reviewComments, issueComments] = await Promise.all([
      ghFetch(`pulls/${pr.number}/reviews`, token),
      ghFetch(`pulls/${pr.number}/comments`, token, { per_page: 100 }),
      ghFetch(`issues/${pr.number}/comments`, token, { per_page: 100 }),
    ]);

    const combined = [...reviews, ...reviewComments, ...issueComments]
      .filter(isQodoEntry)
      .map(normalizeEntry);

    renderMessages(combined);
  } catch (error) {
    console.error(error);
    els.messages.innerHTML = `<div class="empty">Unable to load feedback: ${error.message}</div>`;
  }
}

// Wire up controls
[els.stateFilter, els.search].forEach((input) => {
  input.addEventListener("input", () => filterPrs());
});

els.token.addEventListener("change", () => loadPrs());

loadPrs();
