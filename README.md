# 🌌 VibeChat

A lightweight, premium chat interface for collaborative fiction writing with DeepSeek models. Vanilla HTML/CSS/JS — no build tools, no frameworks, no bundlers. Runs as a desktop web app with a Node.js backend, *or* as a standalone serverless Android APK.

[![Download APK](https://img.shields.io/badge/Download-VibeChat.apk-blue?style=for-the-badge&logo=android)](https://github.com/apricot57/vibe-api/releases/download/v1.0.0-beta/VibeChat.apk)

---

## ✨ Features

### Core
- **Streaming responses** — Real-time token streaming with markdown rendering and collapsible reasoning blocks
- **Thinking mode** — Toggle DeepSeek reasoning (chain-of-thought) on or off per session
- **Model selection** — Switch between DeepSeek V4 Pro and V4 Flash

### Writing Tools
- **System prompt profiles** — Curated factory prompts for fiction genres and world-building, plus user-created prompts editable in-app
- **Message editing** — Inline edit any message (user or AI). Editing a user message triggers regeneration; editing an AI message saves the rewrite in-place
- **Version navigation** — Edited and regenerated messages are tracked as version groups with prev/next navigation controls
- **Regenerate** — Re-roll any AI response, creating a new version branch
- **Magic Rewrite** — Select text within an AI response and rewrite *just that section* via a floating instruction dialog
- **Continue** — One-click button to continue the last AI response without typing

### Management
- **Conversation management** — Create, rename, and delete conversations with persistent history
- **Export to Markdown** — Download any conversation as a `.md` file
- **Abort** — Stop generation mid-stream

### Mobile (Android APK)
- **100% serverless** — Runs entirely client-side using IndexedDB. No backend, no server, no Node.js
- **Direct DeepSeek streaming** — Calls the DeepSeek API directly from the WebView
- **Collapsible settings drawer** — Config selectors (model, prompt, thinking mode) collapse into a toggle icon on mobile to maximize chat space
- **Smart keyboard management** — Soft keyboard only appears when you explicitly tap the message field

---

## 🚀 Quick Start

### Desktop (Node.js)

Prerequisites: [Node.js](https://nodejs.org/) (any recent version).

```bash
node server.js
```

Open http://localhost:3000 in your browser.

On Windows, double-click `start-vibechat.bat` — it starts the server, opens the browser, and shuts down when you press any key.

### Android (Standalone APK)

No server required. Download and sideload the APK:

1. Download **[VibeChat.apk](https://github.com/apricot57/vibe-api/releases/download/v1.0.0-beta/VibeChat.apk)** from the Releases page
2. Transfer to your Android device and install (enable "Unknown Sources" if prompted)
3. Open the app, tap the sidebar **API Key** button, paste your DeepSeek API key
4. Start writing

Your API key and all chat history are stored locally on-device in IndexedDB. Nothing leaves your phone except the DeepSeek API calls.

---

## 🏗️ Architecture

VibeChat has two runtime modes that share the same frontend codebase:

```
┌─────────────────────────────────────────────────────────┐
│                    www/ (Frontend)                       │
│  index.html · app.js · style.css · css/* · js/*         │
├─────────────────────────┬───────────────────────────────┤
│   Desktop Mode          │   Android Mode                │
│   (Node.js backend)     │   (Serverless / Capacitor)    │
│                         │                               │
│   server.js             │   js/db.js                    │
│   src/server/db.js      │   IndexedDB fetch interceptor │
│   src/server/routes.js  │   Direct DeepSeek API calls   │
│   src/server/prompts.js │   js/starter_prompts.js       │
│   data/db.json          │   (bundled factory prompts)   │
│                         │                               │
│   API key stored        │   API key stored              │
│   server-side           │   on-device in IndexedDB      │
└─────────────────────────┴───────────────────────────────┘
```

In **Desktop mode**, the Node.js server proxies DeepSeek API calls (keeping your key off the browser) and persists data to `data/db.json`.

In **Android mode**, `js/db.js` intercepts all `fetch('/api/...')` calls and emulates the entire REST API in-browser using IndexedDB. The DeepSeek API is called directly from the WebView.

---

## 📁 Project Structure

```
vibe-api/
├── www/                        Frontend (shared between desktop & Android)
│   ├── index.html              App markup and modals
│   ├── app.js                  Frontend entrypoint (imports and orchestrates js/* modules)
│   ├── style.css               CSS entrypoint (aggregates css/* sheets via @import)
│   ├── favicon.png             App icon
│   │
│   ├── css/                    Modular CSS stylesheets
│   │   ├── variables.css       Design tokens, dark theme, global reset, helper utilities
│   │   ├── layout.css          Sidebar drawer, main content header & footer frames
│   │   ├── messages.css        Chat bubbles, collapsible reasoning, message actions, edit inputs
│   │   ├── input.css           Bottom input form, model/prompt dropdowns, continue button, mobile drawer
│   │   ├── modals.css          Dialog overlays (API keys, prompts, deletion warnings)
│   │   └── magic.css           Magic Rewrite floating wand, rewrite dialog, glow animations
│   │
│   └── js/                     Modular ES6 frontend modules
│       ├── state.js            Shared client-side state object and helpers
│       ├── api.js              REST API communication helpers and prompt management
│       ├── ui.js               DOM renderers, message actions, streaming UI, conversation mgmt
│       ├── magic.js            Text selection hooks, floating wand, inline rewrite logic
│       ├── db.js               Client-side IndexedDB wrapper and fetch interceptor (Android mode)
│       └── starter_prompts.js  Pre-compiled factory prompt content (Android offline mode)
│
├── server.js                   Node.js server entrypoint (static files + REST API + DeepSeek proxy)
├── start-vibechat.bat          Windows launcher
├── src/
│   └── server/                 Modular backend logic (desktop mode)
│       ├── db.js               Low-level read/write helpers for data/db.json
│       ├── prompts.js          System prompt auto-discovery from prompt_cards/
│       └── routes.js           REST API route handlers and DeepSeek SSE proxy
│
├── data/
│   └── db.json                 Server-side JSON database (desktop mode)
├── prompt_cards/               System prompt markdown files organized into category subfolders
│   ├── story-writing/          Fiction genre prompts
│   └── generators/             Premise and world-building generators
│
├── android/                    Capacitor Android native project (auto-generated)
├── capacitor.config.json       Capacitor configuration (webDir, androidScheme, allowNavigation)
├── package.json                NPM dependencies (Capacitor core + CLI + Android platform)
│
├── .github/
│   └── workflows/
│       └── android.yml         GitHub Actions CI/CD — compiles APK and publishes releases
│
├── apk_output/
│   └── app-debug.apk           Latest compiled debug APK
└── README.md
```

---

## ⚙️ How It Works

### REST API (Desktop Mode)

The Node.js server provides a REST API and proxies requests to DeepSeek:

| Endpoint | Description |
|---|---|
| `GET/POST /api/config` | Server config (API key status, active model, thinking mode) |
| `GET/POST /api/conversations` | List or create conversations |
| `PUT/DELETE /api/conversations/:id` | Update or delete a conversation |
| `GET/POST /api/messages` | Get or create messages (filtered by `conversationId`) |
| `PUT /api/messages/:id` | Update a message (edit content, toggle active state, set versioning) |
| `GET/POST /api/user-prompts` | List or create/update user-created prompts |
| `DELETE /api/user-prompts/:id` | Delete a user prompt |
| `GET /api/prompts` | List factory prompts from `prompt_cards/` |
| `GET /api/prompts/:category/:filename` | Get a specific factory prompt's content |
| `POST /api/chat/completions` | Proxies to `api.deepseek.com/chat/completions` with stored key |

### Client-Side Database (Android Mode)

In Android/serverless mode, `js/db.js` overrides `window.fetch` to intercept all `/api/*` requests. Each endpoint is emulated using a Promise-based IndexedDB wrapper with four object stores: `config`, `conversations`, `messages`, and `userPrompts`. DeepSeek API calls bypass the interceptor and go directly to `https://api.deepseek.com`.

### Data Flow

1. Your message is saved to the database (server-side JSON or client-side IndexedDB) and rendered in the UI
2. Full conversation history is fetched and sent to DeepSeek
3. The response streams back as SSE tokens, rendered in real time with markdown
4. On completion, the full response is saved to the database

---

## 📝 System Prompts

Factory prompts are loaded from `prompt_cards/` subfolders (desktop) or from the pre-compiled `starter_prompts.js` module (Android). Drop a `.md` file into any subfolder, restart the server, and it appears in the prompt selector. The first line should be:

```markdown
# System Prompt: Your Display Name
```

The subfolder name becomes the category label. Files starting with `.` are ignored.

User-created prompts are stored in the database and can be created, edited, and deleted through the app UI. On Android, you can also import prompts from `.md` files on your device.

---

## 🤖 Models

- **DeepSeek V4 Pro** — Maximum reasoning and intelligence (default)
- **DeepSeek V4 Flash** — High-speed, efficient generation

The selected model is persisted per-session. Thinking mode (chain-of-thought reasoning) can be toggled on or off via the brain icon toggle in the input area.

---

## 📦 Android Build & CI/CD

The Android APK is compiled automatically via GitHub Actions on every push. Tagged pushes (`v*`) also create a GitHub Release with the APK attached as `VibeChat.apk`.

### Manual Build

```bash
npm install
npx cap sync android
cd android && ./gradlew assembleDebug
```

The compiled APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`.

### Automated Release

Push a version tag to trigger an automatic release:

```bash
git tag v1.1.0
git push origin v1.1.0
```

The GitHub Actions workflow will compile the APK and publish it as a GitHub Release with the `VibeChat.apk` binary attached.

---

## 💾 Data

**Desktop**: All persistent data lives in `data/db.json` — conversations, messages, user prompts, API key, and model preferences. The file is human-readable JSON.

**Android**: Data is stored in the browser's IndexedDB within the Capacitor WebView. It persists across app restarts but is cleared if you uninstall the app.
