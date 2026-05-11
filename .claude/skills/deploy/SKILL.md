---
name: deploy
description: "Deploy the reading tracker to GitHub Pages. Use this skill whenever the user says 'deploy', '发布', '部署', 'push to gh-pages', 'trigger workflow', '更新网站', or any variation of wanting to get the latest reading tracker live on the site. Covers both remote GitHub Actions trigger and local build+push."
---

# Deploy Reading Tracker

Two deployment methods are available. Ask the user which one they prefer, or pick based on context:

## Method 1: Remote Trigger (GitHub Actions)

Preferred when: the user just wants to refresh the live site, no local code changes involved.

**Prerequisites:** `gh` CLI must be installed and authenticated.

Steps:
1. Run `gh workflow run deploy.yml --repo Nickilism/reading-tracker` to trigger the workflow
2. Confirm the workflow was dispatched: `gh run list --workflow=deploy.yml --repo Nickilism/reading-tracker --limit=1`
3. Tell the user the workflow is running and they can watch it at `https://github.com/Nickilism/reading-tracker/actions`

## Method 2: Local Build + Push

Preferred when: the user has made local changes to `template.js`, `reading-tracker-github.js`, or other code and wants to deploy them immediately (without waiting for a PR/merge).

**Prerequisites:** Node.js installed, `AIRTABLE_API_KEY` environment variable set (loaded from `.env` via dotenv).

Steps:
1. Run `node reading-tracker-github.js` in the project root to generate the HTML
2. Verify the output file was created (e.g., `2026_reading_tracker.html`)
3. Force-push the generated HTML to `gh-pages`:
   ```bash
   git checkout gh-pages
   git add -f *_reading_tracker.html
   git commit -m "deploy: update reading tracker"
   git push origin gh-pages
   git checkout main
   ```
   If the `gh-pages` branch doesn't exist locally yet, create it from remote first: `git fetch origin gh-pages:gh-pages`

## Decision Guide

| Situation | Use |
|---|---|
| User says "deploy" without more context | Ask: remote trigger or local build? |
| User changed code locally | Local build + push |
| User just wants to refresh data from Airtable | Remote trigger |
| User says "发布" / "部署" / "更新网站" | Ask which method |
