# Qodo Demo – Chevron Asset Monitoring Codebase

This repo is designed as a **demo** for showcasing Qodo's ability to:

- Understand complex, semi-legacy codebases
- Perform deep, multi-file PR review
- Suggest safe, production-ready refactors
- Enforce config-driven rules (e.g. no hardcoded thresholds)
- Generate tests and improve CI workflows

It contains:

- A legacy Python service (`legacy_asset_monitor.py`)
- A refactored Python service (`asset_monitor.py`)
- A YAML config with thresholds (`config.yaml`)
- A small JavaScript dashboard (`dashboard.js`)
- A GitHub Actions CI workflow (`.github/workflows/ci.yml`)
- Demo scripts and slide outlines under `docs/` for live presentations

## Getting Started

### Python environment

```bash
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -U pip
pip install pytest

## GitHub Pages embeds

The `docs/` folder contains two drop-in experiences that can be published via GitHub Pages and embedded anywhere with an `<iframe>`:

- `docs/index.html` – an interactive sensor simulator you can control through `postMessage` or the exposed `window.assetMonitorEmbed` helpers.
- `docs/qodo-feedback.html` – a pull-request viewer that calls the GitHub REST API to surface Qodo-authored review comments. Provide a token (optional) to raise rate limits or access private repos.

### Publishing instructions

1. Push the latest `docs/` assets to `main`.
2. In GitHub, open `Settings → Pages`, choose “Deploy from branch”, pick the `main` branch and set the folder to `/docs`.
3. Wait for the “Your site is published” banner, then load `https://YOUR-USERNAME.github.io/qodo_chevron_demo_repo/` for the simulator or append `/qodo-feedback.html` for the PR feedback viewer.

GitHub’s Pages + Jekyll guide covers these steps in more detail and includes troubleshooting tips if the page 404s while publishing propagates. For reference, see the [official documentation](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/adding-content-to-your-github-pages-site-using-jekyll#about-content-in-jekyll-sites).
