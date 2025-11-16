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
