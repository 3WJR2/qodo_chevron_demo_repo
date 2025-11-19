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
  diffTotals: document.getElementById("diffTotals"),
  diffFiles: document.getElementById("diffFiles"),
  diffViewer: document.getElementById("diffViewer"),
  fileFilterInput: document.getElementById("fileFilterInput"),
  tabs: document.querySelectorAll(".tab"),
  tabPanels: document.querySelectorAll(".tab-panel"),
};

// Load saved token from localStorage on page load
const TOKEN_STORAGE_KEY = 'qodo_gh_token';
if (els.token) {
  const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
  if (savedToken) {
    els.token.value = savedToken;
  }
  
  // Save token to localStorage when it changes
  els.token.addEventListener('input', () => {
    const token = els.token.value.trim();
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  });
  
  // Also save on blur (when user leaves the field)
  els.token.addEventListener('blur', () => {
    const token = els.token.value.trim();
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    }
  });
}

const state = {
  prs: [],
  filtered: [],
  active: null,
  diffFiles: [],
  activeDiffFile: null,
};

// Helper function to ensure highlight.js is ready and highlight code blocks
function highlightCodeBlocks(container) {
  // Check both window.hljs and global hljs (for module scope)
  const hljsLib = typeof hljs !== 'undefined' ? hljs : (typeof window !== 'undefined' && window.hljs ? window.hljs : null);
  
  if (!hljsLib || !hljsLib.highlightElement) {
    // If hljs isn't ready yet, try again after a short delay
    setTimeout(() => highlightCodeBlocks(container), 100);
    return;
  }
  
  // Find all code blocks - GitHub uses <pre> with spans, not <pre><code>
  // First try standard <pre><code> structure
  let codeBlocks = Array.from(container.querySelectorAll('pre code'));
  codeBlocks = codeBlocks.filter(block => !block.classList.contains('hljs'));
  
  // If no <pre><code> found, look for <pre> tags directly (GitHub's format)
  // GitHub wraps code in <pre> with <span> children for highlighting
  if (codeBlocks.length === 0) {
    const preTags = container.querySelectorAll('pre:not(.hljs)');
    preTags.forEach(pre => {
      // Skip if already highlighted
      if (pre.classList.contains('hljs')) return;
      
      // Check if this pre tag contains code (has text content and isn't empty)
      const text = pre.textContent?.trim();
      if (!text || text.length === 0) return;
      
      // Check if it already has a code child (standard format)
      let codeElement = pre.querySelector('code');
      
      // If no code child, wrap the content in a code element for highlight.js
      if (!codeElement) {
        // Create a code element and move the pre's content into it
        codeElement = document.createElement('code');
        // Clone all child nodes
        const children = Array.from(pre.childNodes);
        children.forEach(child => {
          codeElement.appendChild(child.cloneNode(true));
        });
        // Clear pre and add code element
        pre.innerHTML = '';
        pre.appendChild(codeElement);
      }
      
      if (!codeBlocks.includes(codeElement)) {
        codeBlocks.push(codeElement);
      }
    });
  }
  
  // Try GitHub's highlight div structure
  if (codeBlocks.length === 0) {
    const highlightBlocks = container.querySelectorAll('div.highlight pre code, pre.highlight code');
    codeBlocks = Array.from(highlightBlocks).filter(block => !block.classList.contains('hljs'));
  }
  
  if (codeBlocks.length === 0) {
    // Debug: log what we're looking at
    const allPre = container.querySelectorAll('pre');
    const allCode = container.querySelectorAll('code');
    console.debug('No code blocks found. Found', allPre.length, 'pre tags and', allCode.length, 'code tags in container');
    
    // Detailed debugging - check the structure
    if (allPre.length > 0) {
      console.debug('Pre tags structure:');
      allPre.forEach((pre, i) => {
        console.debug(`Pre ${i}:`, {
          hasCodeChild: !!pre.querySelector('code'),
          directChildren: Array.from(pre.children).map(c => c.tagName),
          textContent: pre.textContent.substring(0, 100),
          innerHTML: pre.innerHTML.substring(0, 200)
        });
      });
    }
    
    if (allCode.length > 0) {
      console.debug('Code tags structure:');
      allCode.forEach((code, i) => {
        const parent = code.parentElement;
        console.debug(`Code ${i}:`, {
          parentTag: parent?.tagName,
          parentClass: parent?.className,
          isInPre: parent?.tagName === 'PRE' || code.closest('pre') !== null,
          textContent: code.textContent.substring(0, 100)
        });
      });
    }
    
    return;
  }
  
  console.debug('Found', codeBlocks.length, 'code blocks to highlight');
  
  // Highlight each block individually
  codeBlocks.forEach((block, index) => {
    try {
      // Make sure the block has text content
      if (!block.textContent || block.textContent.trim().length === 0) {
        console.debug('Skipping empty code block', index);
        return;
      }
      
      // Check if already highlighted
      if (block.classList.contains('hljs')) {
        console.debug('Code block already highlighted', index);
        return;
      }
      
      console.debug('Highlighting code block', index, 'with content:', block.textContent.substring(0, 100));
      
      // highlightElement will auto-detect language if not specified
      hljsLib.highlightElement(block);
      
      // Verify it worked
      if (block.classList.contains('hljs')) {
        console.debug('Successfully highlighted code block', index);
      } else {
        console.warn('highlightElement did not add hljs class to block', index);
      }
    } catch (e) {
      // If highlighting fails, log for debugging but continue
      console.warn('Highlight.js error:', e, block, block.textContent?.substring(0, 50));
    }
  });
}

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

function renderSplitDiff(patch) {
  if (!patch) {
    return "";
  }
  const lines = patch.split("\n");
  let leftLine = 0;
  let rightLine = 0;
  const rows = [];
  const hunkRegex = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

  lines.forEach((line) => {
    if (!line) {
      return;
    }
    if (line.startsWith("@@")) {
      const match = line.match(hunkRegex);
      if (match) {
        leftLine = Number(match[1]) - 1;
        rightLine = Number(match[2]) - 1;
      }
      rows.push(
        `<tr class="diff-row hunk"><td colspan="2"><span class="code">${escapeHtml(line)}</span></td></tr>`,
      );
      return;
    }

    if (line.startsWith("-")) {
      leftLine += 1;
      rows.push(
        `<tr class="diff-row">
          <td class="diff-cell del">
            <span class="line-no">${leftLine}</span>
            <span class="code">${escapeHtml(line.slice(1) || " ")}</span>
          </td>
          <td class="diff-cell blank"></td>
        </tr>`,
      );
      return;
    }

    if (line.startsWith("+")) {
      rightLine += 1;
      rows.push(
        `<tr class="diff-row">
          <td class="diff-cell blank"></td>
          <td class="diff-cell add">
            <span class="line-no">${rightLine}</span>
            <span class="code">${escapeHtml(line.slice(1) || " ")}</span>
          </td>
        </tr>`,
      );
      return;
    }

    leftLine += 1;
    rightLine += 1;
    rows.push(
      `<tr class="diff-row">
        <td class="diff-cell ctx">
          <span class="line-no">${leftLine}</span>
          <span class="code">${escapeHtml(line.slice(1) || " ")}</span>
        </td>
        <td class="diff-cell ctx">
          <span class="line-no">${rightLine}</span>
          <span class="code">${escapeHtml(line.slice(1) || " ")}</span>
        </td>
      </tr>`,
    );
  });

  return `<table class="diff-split"><tbody>${rows.join("")}</tbody></table>`;
}

function enhanceDiffBlocks(html) {
  if (!html) {
    return html;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("pre code").forEach((code) => {
    const text = code.textContent || "";
    if (text.includes("@@")) {
      const table = renderSplitDiff(text);
      if (table) {
        const wrapper = document.createElement("div");
        wrapper.innerHTML = table;
        const parentPre = code.closest("pre");
        if (parentPre) {
          parentPre.replaceWith(wrapper.firstElementChild);
        }
      }
    }
  });
  return template.innerHTML;
}

function enhanceTables(html) {
  if (!html) {
    return html;
  }
  const template = document.createElement("template");
  template.innerHTML = html;
  
  template.content.querySelectorAll("table").forEach((table) => {
    table.classList.add("suggestions-table");
    
    // Find header row to determine column indices
    const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
    const headerCells = Array.from(headerRow.querySelectorAll("th, td"));
    
    let impactIndex = -1;
    let suggestionIndex = -1;
    let categoryIndex = -1;
    
    headerCells.forEach((cell, index) => {
      const text = cell.textContent.toLowerCase().trim();
      if (text.includes("impact")) {
        impactIndex = index;
      } else if (text.includes("suggestion")) {
        suggestionIndex = index;
      } else if (text.includes("category")) {
        categoryIndex = index;
      }
    });
    
    // Process data rows
    const rows = Array.from(table.querySelectorAll("tr"));
    rows.forEach((row, rowIndex) => {
      // Skip header row
      if (rowIndex === 0 && (headerRow === row || row.querySelector("th"))) {
        return;
      }
      
      const cells = Array.from(row.querySelectorAll("td, th"));
      
      cells.forEach((cell, index) => {
        // Style impact column
        if (index === impactIndex && cell.tagName === "TD") {
          const impactText = cell.textContent.toLowerCase().trim();
          let impactLevel = null;
          if (impactText.includes("high")) {
            impactLevel = "high";
          } else if (impactText.includes("medium")) {
            impactLevel = "medium";
          } else if (impactText.includes("low")) {
            impactLevel = "low";
          }
          
          if (impactLevel) {
            cell.className = `impact-cell impact-${impactLevel}`;
            cell.innerHTML = `<span class="impact-chip impact-${impactLevel}">IMPACT: ${impactLevel.toUpperCase()}</span>`;
          }
        }
        
        // Process suggestion column (make links clickable with arrow)
        if (index === suggestionIndex && cell.tagName === "TD") {
          const links = cell.querySelectorAll("a");
          links.forEach((link) => {
            if (!link.querySelector(".suggestion-arrow")) {
              const arrow = document.createElement("span");
              arrow.className = "suggestion-arrow";
              arrow.textContent = "►";
              link.insertBefore(arrow, link.firstChild);
              link.classList.add("suggestion-link");
            }
          });
          // If no link exists, wrap text in a link-like style
          if (links.length === 0 && cell.textContent.trim()) {
            const text = cell.textContent.trim();
            if (text.startsWith("►")) {
              cell.innerHTML = `<span class="suggestion-link"><span class="suggestion-arrow">►</span>${text.substring(1).trim()}</span>`;
            } else {
              cell.innerHTML = `<span class="suggestion-link"><span class="suggestion-arrow">►</span>${text}</span>`;
            }
          }
        }
      });
    });
  });
  
  return template.innerHTML;
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
  pre: ["class"],
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
        sort: "updated",
        direction: "asc",
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
      let bodyHtml = msg.body_html
        ? sanitizeHtmlFragment(msg.body_html)
        : msg.body
          ? `<p>${escapeHtml(msg.body)}</p>`
          : '<p class="muted"><em>No comment body provided.</em></p>';
      
      // Enhance tables and diff blocks
      bodyHtml = enhanceTables(bodyHtml);
      bodyHtml = enhanceDiffBlocks(bodyHtml);
      
      // Check if this is a "PR Code Suggestions" message
      const isSuggestionsMessage = (msg.body || msg.body_html || "").toLowerCase().includes("pr code suggestions") || 
                                   (msg.body || msg.body_html || "").toLowerCase().includes("code suggestions");
      const diffBlock = msg.diff_hunk
        ? renderSplitDiff(msg.diff_hunk)
        : "";
      const link = msg.html_url
        ? `<a class="message-link" href="${msg.html_url}" target="_blank" rel="noopener">Jump to GitHub</a>`
        : "";
      
      // Extract impact level from message body
      const bodyText = (msg.body || msg.body_html || "").toLowerCase();
      let impactLevel = null;
      
      // Check for impact in text patterns
      if (bodyText.includes("impact: high") || bodyText.includes("high impact") || bodyText.match(/impact[\s:]+high/i)) {
        impactLevel = "high";
      } else if (bodyText.includes("impact: medium") || bodyText.includes("medium impact") || bodyText.match(/impact[\s:]+medium/i)) {
        impactLevel = "medium";
      } else if (bodyText.includes("impact: low") || bodyText.includes("low impact") || bodyText.match(/impact[\s:]+low/i)) {
        impactLevel = "low";
      }
      
      // Also check HTML tables for impact column
      if (!impactLevel && msg.body_html) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = msg.body_html;
        const tables = tempDiv.querySelectorAll("table");
        for (const table of tables) {
          const headers = Array.from(table.querySelectorAll("th, td")).map(cell => cell.textContent.toLowerCase().trim());
          const impactIndex = headers.findIndex(h => h.includes("impact"));
          if (impactIndex >= 0) {
            const rows = table.querySelectorAll("tr");
            for (const row of rows) {
              const cells = Array.from(row.querySelectorAll("td"));
              if (cells[impactIndex]) {
                const impactValue = cells[impactIndex].textContent.toLowerCase().trim();
                if (impactValue === "high") {
                  impactLevel = "high";
                  break;
                } else if (impactValue === "medium") {
                  impactLevel = "medium";
                  break;
                } else if (impactValue === "low") {
                  impactLevel = "low";
                  break;
                }
              }
            }
            if (impactLevel) break;
          }
        }
      }
      
      // Extract title and subtitle if it's a suggestions message
      let titleHtml = "";
      let subtitleHtml = "";
      let contentHtml = bodyHtml;
      
      if (isSuggestionsMessage) {
        const tempDiv = document.createElement("div");
        tempDiv.innerHTML = bodyHtml;
        
        // Look for h1/h2/h3 with "PR Code Suggestions"
        const titleEl = tempDiv.querySelector("h1, h2, h3");
        if (titleEl && titleEl.textContent.toLowerCase().includes("code suggestions")) {
          titleHtml = `<h1 class="suggestions-title">${titleEl.innerHTML}</h1>`;
          titleEl.remove();
        } else {
          titleHtml = '<h1 class="suggestions-title">PR Code Suggestions ✨</h1>';
        }
        
        // Look for subtitle paragraph
        const firstP = tempDiv.querySelector("p");
        if (firstP && !firstP.textContent.toLowerCase().includes("impact")) {
          subtitleHtml = `<p class="suggestions-subtitle">${firstP.innerHTML}</p>`;
          firstP.remove();
        } else {
          subtitleHtml = '<p class="suggestions-subtitle">Explore these optional code suggestions:</p>';
        }
        
        contentHtml = tempDiv.innerHTML;
      }
      
      card.innerHTML = `
        <header class="message-header">
          <div class="message-header-left">
            <img src="qodo-logo.png" alt="Qodo" class="qodo-logo" />
            <div class="chip kind-${msg.kind}">
              ${label}
              ${pathLabel}
            </div>
          </div>
          <div class="message-meta">
            <span>@${msg.author}</span>
            <time>${new Date(msg.timestamp).toLocaleString()}</time>
          </div>
        </header>
        <div class="message-body gh-markdown">
          ${titleHtml}
          ${subtitleHtml}
          ${contentHtml}
        </div>
        ${diffBlock}
        ${link}
      `;
      els.messages.appendChild(card);
      
      // Highlight code blocks in this card after DOM is ready
      // Use requestAnimationFrame + setTimeout to ensure DOM is fully updated
      requestAnimationFrame(() => {
        setTimeout(() => {
          highlightCodeBlocks(card);
        }, 50);
      });
    });
    
    // Also run a final pass on the entire messages container as a fallback
    // This catches any code blocks that might have been missed
    requestAnimationFrame(() => {
      setTimeout(() => {
        highlightCodeBlocks(els.messages);
      }, 200);
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
  els.diffTotals.textContent = `${files.length} file${files.length === 1 ? "" : "s"} changed`;
  const statsEl = document.getElementById('filesChangedStats');
  if (statsEl) {
    statsEl.textContent = `+${additions} -${deletions}`;
  }
}

function buildFileTree(files) {
  const root = {};
  files.forEach((file) => {
    const parts = file.filename.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      if (!cursor[part]) {
        cursor[part] = {
          __children: {},
          __files: [],
          __isFile: index === parts.length - 1,
        };
      }
      if (index === parts.length - 1) {
        cursor[part].__file = file;
      } else {
        cursor = cursor[part].__children;
      }
    });
  });
  return root;
}

function renderFileNode(nodeName, nodeData, depth = 0) {
  const isFile = !!nodeData.__isFile;
  const indent = depth * 16;
  if (isFile && nodeData.__file) {
    const file = nodeData.__file;
    const status = file.status;
    // GitHub-style icons: green plus for added, red square for modified/deleted
    let statusIcon = '';
    if (status === 'added') {
      statusIcon = '<span class="file-status-icon file-status-added" aria-label="Added">+</span>';
    } else if (status === 'removed') {
      statusIcon = '<span class="file-status-icon file-status-removed" aria-label="Removed">−</span>';
    } else {
      statusIcon = '<span class="file-status-icon file-status-modified" aria-label="Modified">M</span>';
    }
    
    return `
      <button class="diff-file-btn file" style="--indent:${indent}px" data-filename="${file.filename}">
        <span class="file-label">
          ${statusIcon}
          <span class="filename">${escapeHtml(file.filename)}</span>
        </span>
        <span class="file-stats">
          <span class="diff-chip add">+${file.additions}</span>
          <span class="diff-chip del">-${file.deletions}</span>
        </span>
      </button>
    `;
  }

  const childrenHtml = Object.entries(nodeData.__children || {})
    .map(([childName, childNode]) => renderFileNode(childName, childNode, depth + 1))
    .join("");

  return `
    <details class="diff-dir" open>
      <summary style="--indent:${indent}px">
        <span class="dir-icon" aria-hidden="true">▸</span>
        ${escapeHtml(nodeName)}
      </summary>
      ${childrenHtml}
    </details>
  `;
}

function renderDiffFiles(files, filter = '') {
  if (!files.length) {
    els.diffFiles.innerHTML = '<div class="empty">No file changes found.</div>';
    els.diffViewer.innerHTML = '<div class="empty">Nothing to preview.</div>';
    renderDiffTotals(files);
    return;
  }

  // Filter files if search term provided
  const filteredFiles = filter
    ? files.filter(file => file.filename.toLowerCase().includes(filter.toLowerCase()))
    : files;

  const tree = buildFileTree(filteredFiles);
  els.diffFiles.innerHTML = Object.entries(tree)
    .map(([name, node]) => renderFileNode(name, node))
    .join("");

  els.diffFiles.querySelectorAll(".diff-file-btn.file").forEach((btn) => {
    btn.addEventListener("click", () => selectDiffFile(btn.dataset.filename));
    if (state.activeDiffFile === btn.dataset.filename) {
      btn.classList.add("active");
    }
  });

  renderDiffTotals(files);
}

function detectLanguageFromFilename(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  const langMap = {
    'py': 'python',
    'js': 'javascript',
    'ts': 'typescript',
    'yaml': 'yaml',
    'yml': 'yaml',
    'sh': 'bash',
    'bash': 'bash',
    'md': 'markdown',
    'html': 'html',
    'css': 'css',
    'json': 'json',
    'xml': 'xml',
    'go': 'go',
    'rs': 'rust',
    'java': 'java',
    'cpp': 'cpp',
    'c': 'c',
    'diff': 'diff',
    'patch': 'diff',
  };
  return langMap[ext] || null;
}

// Highlight code in diff cells using highlight.js
function highlightDiffCode(container, filename) {
  // Check both window.hljs and global hljs (for module scope)
  const hljsLib = typeof hljs !== 'undefined' ? hljs : (typeof window !== 'undefined' && window.hljs ? window.hljs : null);
  
  if (!hljsLib || !hljsLib.highlight) {
    // If hljs isn't ready yet, try again after a short delay
    setTimeout(() => highlightDiffCode(container, filename), 100);
    return;
  }
  
  const language = detectLanguageFromFilename(filename);
  if (!language) {
    // No language detected, skip highlighting
    return;
  }
  
  // Find all code spans in diff cells (but not in hunk rows)
  const codeSpans = container.querySelectorAll('.diff-cell .code:not(.hunk .code)');
  
  if (codeSpans.length === 0) {
    return;
  }
  
  codeSpans.forEach((span) => {
    try {
      const code = span.textContent || '';
      if (!code.trim() || code.trim().length === 0) {
        return;
      }
      
      // Use highlight.js to get highlighted HTML
      const result = hljsLib.highlight(code, { language });
      
      // Apply the highlighted HTML, preserving the span structure
      // highlight.js returns HTML with its own spans, so we replace the content
      span.innerHTML = result.value;
      
      // Add hljs class to indicate it's been highlighted
      span.classList.add('hljs');
    } catch (e) {
      // If highlighting fails (e.g., language not supported), just continue
      console.debug('Diff highlighting error:', e);
    }
  });
}

function renderDiffViewer(file) {
  if (!file) {
    els.diffViewer.innerHTML = '<div class="empty">Pick a file to preview the diff.</div>';
    return;
  }

  const patch =
    file.patch && file.patch.trim().length
      ? renderSplitDiff(file.patch)
      : '<div class="empty">Binary file or patch unavailable.</div>';

  // GitHub-style collapsible file block
  const fileSize = file.additions + file.deletions;
  els.diffViewer.innerHTML = `
    <div class="file-diff-block">
      <div class="file-diff-header">
        <button class="file-diff-toggle" aria-expanded="true">
          <svg class="file-diff-icon" width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M12.78 6.22a.75.75 0 010 1.06l-4.25 4.25a.75.75 0 01-1.06 0L3.22 7.28a.75.75 0 011.06-1.06L8 9.94l3.72-3.72a.75.75 0 011.06 0z"></path>
          </svg>
        </button>
        <div class="file-diff-title">
          <span class="file-diff-name">${escapeHtml(file.filename)}</span>
          <span class="file-diff-badge">${fileSize} ${fileSize === 1 ? 'change' : 'changes'}</span>
        </div>
      </div>
      <div class="file-diff-content">
        <div class="diff-scroll">
          ${patch}
        </div>
      </div>
    </div>
  `;
  
  // Make it collapsible
  const toggle = els.diffViewer.querySelector('.file-diff-toggle');
  const content = els.diffViewer.querySelector('.file-diff-content');
  if (toggle && content) {
    toggle.addEventListener('click', () => {
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', String(!isExpanded));
      content.style.display = isExpanded ? 'none' : 'block';
      const icon = toggle.querySelector('.file-diff-icon');
      if (icon) {
        icon.style.transform = isExpanded ? 'rotate(-90deg)' : 'rotate(0deg)';
      }
    });
  }
  
  // Highlight code in diff cells
  requestAnimationFrame(() => {
    setTimeout(() => {
      highlightDiffCode(els.diffViewer, file.filename);
    }, 100);
  });
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
    const filter = els.fileFilterInput?.value.trim() || '';
    renderDiffFiles(files, filter);
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

// File filter functionality
if (els.fileFilterInput) {
  els.fileFilterInput.addEventListener("input", (e) => {
    const filter = e.target.value.trim();
    if (state.diffFiles.length > 0) {
      renderDiffFiles(state.diffFiles, filter);
    }
  });
}

els.tabs.forEach((tab) =>
  tab.addEventListener("click", () => {
    const targetId = tab.dataset.target;
    els.tabs.forEach((btn) => {
      const isActive = btn === tab;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });
    els.tabPanels.forEach((panel) => {
      const isActive = panel.id === targetId;
      panel.classList.toggle("active", isActive);
      panel.setAttribute("aria-hidden", String(!isActive));
    });
  }),
);

loadPrs();
