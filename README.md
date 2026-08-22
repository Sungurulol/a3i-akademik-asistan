<div align="center">

# A³I — Akademik Asistan AI

![version](https://img.shields.io/badge/version-3.0.0-blue?style=flat-square)
![license](https://img.shields.io/badge/license-CC%20BY--NC%204.0-gray?style=flat-square)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgray?style=flat-square)
![claude](https://img.shields.io/badge/built%20on-Claude%20Code-orange?style=flat-square)
[![x](https://img.shields.io/badge/follow-%40sungurulol-black?style=flat-square&logo=x)](https://x.com/sungurulol)

**A locally-run academic research assistant built on Claude Code.**  
Deep literature review · Paper writing · Qualitative analysis · Peer review — all from a web interface.

> Built on [Academic Research Skills](https://github.com/Imbad0202/academic-research-skills) by [Cheng-I Wu](https://github.com/Imbad0202) — [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/)

---

[🇹🇷 Türkçe](README.tr.md) · [📦 Download](#installation) · [🚀 Quick Start](#usage)

</div>

---

## What is A³I?

A³I is a **local-first** academic research assistant. It runs entirely on your machine — no data leaves your computer. Powered by Claude Code's multi-agent pipeline, it handles the full academic workflow from research to publication-ready output.

```
Research → Write → Integrity Check → Peer Review → Revise → Finalize
```

Before starting a long task, A³I asks a few multiple-choice questions so the result matches what you actually need — you can get to a finished paper without typing a single sentence.

---

## Features

| | Feature | Description |
|---|---|---|
| 🔍 | **Deep Research** | 13-agent systematic literature review, PRISMA methodology, APA 7.0 |
| ✍️ | **Write Paper** | Full academic paper from scratch with citation check |
| 🏷️ | **Qualitative Analysis** | Grounded theory (Glaserian / Straussian), open–axial–selective coding, codebook export for **NVivo** and **MAXQDA** |
| ⭐ | **Peer Review** | 5-perspective review with 0–100 quality scoring |
| ❓ | **Guided Questions** | Instead of a wall of prose, A³I asks up to 3 multiple-choice questions — each with a free-text option — before it starts |
| 🧠 | **Model & Effort Control** | Switch between Opus 5 / Sonnet 5 / Haiku 4.5 and thinking effort mid-conversation; the session is resumed, so context is kept |
| 📄 | **DOCX · PDF · PPTX Export** | LaTeX-quality academic formatting, content untouched — and any message can be turned into a slide deck |
| 📁 | **Files Pane** | Every file the assistant produces is kept and downloadable from the sidebar, colour-coded by type |
| 📎 | **Smart File Processing** | PDFs are parsed by [opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf) (#1 in extraction benchmarks); DOCX/TXT/MD via MarkItDown. Drag & drop supported |
| 💬 | **Live Streaming** | Real-time token streaming with a floating activity indicator that never shifts the page |
| 💾 | **Local Memory** | Conversations saved to `Chats/`, with pinning and full-text search across titles and messages |
| 🌗 | **Light & Dark Theme** | Adaptive interface built on Apple's design language, with spring-based motion |
| 🇹🇷 | **Turkish UI** | Fully Turkish interface |

---

## Installation

### macOS

```bash
# 1. Download the macOS/ folder
# 2. Right-click kurulum.command → Open → Open
# 3. Follow the on-screen steps
```

### Windows

```bash
# 1. Download the Windows/ folder
# 2. Right-click kurulum.bat → Run as Administrator
# 3. Follow the on-screen steps
```

> **Requirements:** A [Claude](https://claude.ai) account is required. Claude Pro or Max plan is recommended.

The installer automatically sets up:
- **macOS:** Homebrew · Node.js · Python · MarkItDown · Java (Temurin) · Claude Code
- **Windows:** Chocolatey · Node.js · Python · MarkItDown · Java (OpenJDK) · Claude Code

> Java 11+ is required by the PDF parser and is installed for you — no manual step.

---

## Usage

```bash
# macOS
double-click baslat.command

# Windows
double-click baslat.bat
```

The browser opens automatically at `http://localhost:3000`.  
On every launch A³I **checks itself for updates**, pulls them, re-runs the installer if it changed, **auto-updates the academic skill files** and **refreshes your Claude session**.

---

## How It Works

```
┌─────────────────────────────────────────────┐
│              Web UI (Browser)               │
│         http://localhost:3000               │
└──────────────────┬──────────────────────────┘
                   │ WebSocket
┌──────────────────▼──────────────────────────┐
│           Node.js Backend                   │
│        (Express + WebSocket)                │
└──────────────────┬──────────────────────────┘
                   │ stream-json
┌──────────────────▼──────────────────────────┐
│   Claude Code (runs locally, background)    │
│   session-based · 13-agent pipeline         │
└──────────────────┬──────────────────────────┘
                   │ git pull on every launch
┌──────────────────▼──────────────────────────┐
│     academic-research-skills (Skills)       │
│   github.com/Imbad0202/academic-research-skills │
└─────────────────────────────────────────────┘

PDF            → opendataloader-pdf (Java) ─┐
DOCX / TXT / MD → MarkItDown ───────────────┴→ clean Markdown → injected into prompt

Generated files → downloads/ → Files pane in the sidebar
```

---

## Requirements

| | macOS | Windows |
|---|---|---|
| OS | macOS 12+ | Windows 10/11 |
| Auto-installed | Homebrew, Node.js, Python, MarkItDown, Java 11+, Claude Code | Chocolatey, Node.js, Python, MarkItDown, Java 11+, Claude Code |
| Account | Claude Pro / Max | Claude Pro / Max |

---

## Changelog

### v3.0.0

**Interface — rebuilt**
- Complete redesign following Apple's design language: adaptive **light and dark themes**, translucent materials, system-blue accent, and spring-based motion that can be interrupted and reversed mid-flight
- **Welcome screen** with work-mode cards — the empty state was previously blank
- **Files pane** in the sidebar: every file the assistant generates is preserved and downloadable, with colour-coded type badges
- **Chat pinning** and **full-text search** across chat titles and message contents
- Resizable sidebar, drag-to-dismiss dialogs, reduced-motion / reduced-transparency / high-contrast support
- The token bar used to appear and disappear with `display`, pushing the whole conversation down on every message; it is now a floating indicator that never shifts the page

**New**
- **Guided questions** — before a long task the assistant asks up to 3 multiple-choice questions, each with a free-text option, and only asks what is genuinely undetermined. Preset buttons start this flow with a single click, so a paper can be produced without typing anything
- **Qualitative analysis** — grounded theory with the Glaserian / Straussian distinction, theoretical saturation, and codebook export tailored to **NVivo** (`Parent Node / Child Node`) or **MAXQDA** (`Parent Code / Child Code`), including definitions, inclusion–exclusion criteria and verbatim quotes
- **Model and effort control** — Opus 5 / Sonnet 5 / Haiku 4.5 and low→max thinking effort, switchable mid-conversation; the process restarts with `--resume` so the conversation context survives
- **Presentation export** — any assistant message can be converted into an academic `.pptx`
- **Drag & drop** file upload
- **Self-updating launcher** — on start-up the app fetches, pulls, re-runs the installer when it changed, and refreshes dependencies

**Changed**
- **PDF parsing moved from MarkItDown to [opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf)** — ranked #1 for extraction accuracy (0.907 vs 0.589 overall, 0.928 vs 0.273 on tables). Requires Java 11+, which the installer now handles. Other formats still go through MarkItDown
- Default model is **Sonnet 5**; default theme is **dark**
- Preset buttons reworked: **Planla** and **Tam Sistem** removed, **Nitel Analiz** added. Neither capability is lost — the full pipeline and the plan/outline/revision modes are still reached by asking in plain language
- `pptxgenjs`, `exceljs` and `docx` are bundled, so the assistant generates Office files without a runtime `npm install`

**Fixed**
- **Security:** chat and session names were passed straight into file paths, so a crafted name could reach folders outside the app — the worst case being deletion. Unrestricted CORS made this reachable from any website the user visited. All paths are now validated against their base folder, and CORS was removed entirely (the interface is served from the same origin)
- Every new conversation stalled for **8 seconds** before the message was sent: the backend waited for an init event that Claude only emits *after* the first input
- Switching model terminated the replacement process and dropped the session, so the conversation appeared to end
- **Mode selection had no effect** — the system prompt was assembled but never passed to Claude, leaving the preset buttons decorative
- The first context injection sent the current message twice
- **Windows:** `multer` was missing from the dependency list, so file upload crashed
- Generated files were written into a folder that is wiped on every launch, with no way to download them
- A class-name collision made the model selector's chevron blink continuously
- Filenames containing quotes could break out of an HTML attribute

### v2.0.1
- **Fix:** Chat title generation no longer crashes with Turkish (non-ASCII) characters — prompt is now passed via stdin instead of as a CLI argument

### v2.0.0
- **MarkItDown integration** — uploaded files (PDF, DOCX, PPTX, XLSX) are converted to clean Markdown before reaching the model, cutting token usage significantly
- **Skill/tool indicator** — the active skill and tool name are shown live in the top bar during generation
- **Rate limit warning banner** — a visible yellow/red banner appears when approaching or hitting usage limits
- **Automatic session refresh** — `claude auth logout` + `claude auth login` run automatically on every launch
- **Windows installer parity** — Python and MarkItDown are now installed automatically on Windows as well

### v1.1.1
- **Context continuity** — reopening an old chat injects the full conversation history so Claude remembers the context
- **Session stability** — fixed "session already in use" error on app restart
- **Sessions cleanup** — old session folders are cleaned up on every launch

### v1.1.0
- **Real-time streaming** — tokens appear as they are generated
- **Live token counter** — visible in the top bar during generation
- **WebSocket stability** — heartbeat system, auto-reconnect, session rejoin on disconnect
- **Local memory** — conversations saved to `Chats/` folder, reload on app restart
- **Chat management** — rename, delete with confirmation popup
- **AI-generated chat titles** — automatic 3–5 word title per conversation
- **WS status indicator** — green / yellow / red connection state
- **PDF improvements** — broader Chrome path detection for all users

### v1.0.0
- Initial release
- Claude Code multi-agent pipeline integration
- DOCX & PDF export with LaTeX formatting
- Turkish web interface
- macOS & Windows support

---

## Credits

This project is built on top of **[Academic Research Skills](https://github.com/Imbad0202/academic-research-skills)** by [Cheng-I Wu](https://github.com/Imbad0202), licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).

Qualitative methodology comes from the **[grad-grounded-theory](https://github.com/asgard-ai-platform/skills)** skill (Apache-2.0), and academic presentation structure from **[academic-pptx-skill](https://github.com/Gabberflast/academic-pptx-skill)** by Gabberflast (MIT).

PDF parsing is powered by **[opendataloader-pdf](https://github.com/opendataloader-project/opendataloader-pdf)** (Apache-2.0); other file formats by **[MarkItDown](https://github.com/microsoft/markitdown)** by Microsoft (MIT).

---

## Author

Made by [@sungurulol](https://x.com/sungurulol)

---

## License

This project is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to use and share with attribution, non-commercial only.
