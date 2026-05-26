<div align="center">

# A³I — Akademik Asistan AI

![version](https://img.shields.io/badge/version-1.0.0-blue?style=flat-square)
![license](https://img.shields.io/badge/license-CC%20BY--NC%204.0-gray?style=flat-square)
![platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgray?style=flat-square)
![claude](https://img.shields.io/badge/built%20on-Claude%20Code-orange?style=flat-square)
[![x](https://img.shields.io/badge/follow-%40sungurulol-black?style=flat-square&logo=x)](https://x.com/sungurulol)

**A locally-run academic research assistant built on Claude Code.**  
Deep literature review · Paper writing · Peer review · Full pipeline — all from a web interface.

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

---

## Features

| | Feature | Description |
|---|---|---|
| 🔍 | **Deep Research** | 13-agent systematic literature review, PRISMA methodology, APA 7.0 |
| ✍️ | **Write Paper** | Full academic paper from scratch with citation check |
| ⭐ | **Peer Review** | 5-perspective review with 0–100 quality scoring |
| 🔁 | **Full System** | End-to-end pipeline: research → write → review → revise → finalize |
| 📄 | **DOCX & PDF Export** | LaTeX-quality academic formatting, content untouched |
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
- **macOS:** Homebrew · Node.js · Claude Code
- **Windows:** Chocolatey · Node.js · Claude Code

---

## Usage

```bash
# macOS
double-click baslat.command

# Windows
double-click baslat.bat
```

The browser opens automatically at `http://localhost:3000`.  
Academic skill files are **auto-updated** every time you launch.

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
```

---

## Requirements

| | macOS | Windows |
|---|---|---|
| OS | macOS 12+ | Windows 10/11 |
| Auto-installed | Homebrew, Node.js, Claude Code | Chocolatey, Node.js, Claude Code |
| Account | Claude Pro / Max | Claude Pro / Max |

---

## Credits

This project is built on top of **[Academic Research Skills](https://github.com/Imbad0202/academic-research-skills)** by [Cheng-I Wu](https://github.com/Imbad0202), licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/).

---

## Author

Made by [@sungurulol](https://x.com/sungurulol)

---

## License

This project is licensed under [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/) — free to use and share with attribution, non-commercial only.
