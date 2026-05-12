# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

A reading tracker that fetches book data from Airtable and generates self-contained HTML pages deployed to GitHub Pages. Includes an archive landing page that aggregates all years. The system uses country prefix parsing in author fields to derive book origins.

**Live site**: https://nickilism.github.io/reading-tracker/reading%20archive/index.html

## Build & Run Commands

```bash
npm install                                    # Install dependencies (dotenv, prettier)
node reading-tracker-github.js [year]          # Generate HTML for year (CI mode, default: current year)
node reading-tracker-year-github.js            # Generate HTML interactively (prompts for year)
node builder_offline.js <year>                 # Build offline HTML with inlined images & Chart.js
```

## Architecture

### Data Flow
1. **Airtable** (Books table) → **reading-tracker-github.js** (Node.js, fetches via REST API) → **{year}_reading_tracker.html** (self-contained HTML)
2. **reading archive/index.html** — Archive landing page that fetches all yearly HTML files, extracts embedded book JSON, and computes aggregate stats across years

### Key Files
- **reading-tracker-github.js** — Non-interactive generator for CI; fetches records from Airtable, processes books (derives country from author prefix, extracts month from finish date), generates HTML by injecting data into template
- **reading-tracker-year-github.js** — Interactive version for local use; uses readline to prompt for year input
- **template.js** — HTML template with `{{PLACEHOLDER}}` syntax; the generator replaces `{{YEAR}}`, `{{GENERATED_DATE}}`, `{{BOOKS_JSON}}`, and `{{COUNTRY_PREFIX_MAP}}` via String.replace()
- **builder_offline.js** — Offline HTML builder; downloads Chart.js and cover images, converts to base64 data URIs, outputs fully self-contained `_offline.html` files
- **reading archive/index.html** — Archive landing page; dynamically generates year cards (2019–current year) with aggregated stats and top-5 book cover fans per card
- **.github/workflows/deploy.yml** — GitHub Actions workflow; triggers on push to `main` (when source files change), `repository_dispatch` (`airtable-update`), manual (`workflow_dispatch`), or schedule (Mon/Thu 06:00 UTC)
- **.gitattributes** — Enforces LF line endings for `.html`, `.js`, `.yml`, `.md`, `.json`

### Template Injection Pattern
The generator extracts the template string via regex:
```js
const templateContent = fs.readFileSync('./template.js', 'utf8');
const TEMPLATE = templateContent.match(/const template = `([\s\S]*)`;/)[1];
```
Then replaces placeholders and writes the output HTML file.

### Country Derivation
Authors are prefixed with country markers in brackets/parentheses (e.g., `[日]`, `(美)`, `〔德〕`). The script strips these to display author names while mapping prefixes to countries. Unmarked Chinese names default to China; unmarked non-Chinese names default to USA.

### Generated HTML Structure
The output HTML embeds all CSS/JS inline. It includes:
- Dark mode via CSS `prefers-color-scheme` media query (no JS toggle)
- Chart.js bar chart for monthly reading counts
- Cover wall grid with hover overlays
- Collapsible book list with sort/filter controls (by date, rating, pages; filters by rating tier, country, month)
- Country distribution badges with flag emojis
- All book data serialized as JSON and embedded at generation time

## Automation

GitHub Actions deploys to the `gh-pages` branch. To trigger a deploy:
- **Push**: Push to `main` when `template.js`, `reading-tracker-github.js`, `reading-tracker-year-github.js`, or `reading archive/index.html` change
- **Automatic**: Airtable record changes → Zapier sends `repository_dispatch` with type `airtable-update`
- **Manual**: GitHub Actions UI → "Run workflow"
- **Scheduled**: Every Monday and Thursday at 06:00 UTC (14:00 Beijing time)

## Environment Variables

- `AIRTABLE_API_KEY` — Required; set via GitHub Secrets. Airtable personal access token with `data.records:read` scope.
- `BASE_ID` — Hardcoded in script as `appJJmTgbDFTEnJxz`; change here to switch Airtable bases.
