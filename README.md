# Devin Console

A browser console for the [Devin CLI](https://docs.devin.ai/cli) — sessions,
streaming chat, tool calls, permissions, modes, models, usage stats, terminals
and more, served locally over the **Agent Client Protocol (ACP)**.

Think `kimi web`, but for Devin — and open source.

```
npx devin-web-console
```

Then open http://127.0.0.1:7781 — that's it.

## Features

- **Session dashboard** — every Devin CLI session across all your workspaces,
  searchable, grouped by directory, with live activity indicators. Resume any
  session with full history replay (`session/load`).
- **Streaming chat** — markdown with GFM, KaTeX math, Mermaid diagrams and
  syntax highlighting; collapsible thinking blocks; plan checklists.
- **Tool calls, rendered properly** — status, per-file diffs with +/- coloring,
  terminal output, locations. Permission requests become inline cards you
  approve or reject from the browser.
- **Devin modes** — Code / Ask / Plan / Bypass, switched live from the header.
- **Model picker** — the full Devin model catalog (~80 options), grouped by
  family with thinking-level (none → max) and speed (fast/priority) variants,
  image-support badges, and Adaptive highlighted.
- **Usage view** — per-session context-window gauge, per-turn token counts,
  daily aggregates, and an approximate cost-tier reference.
- **Terminals** — agent-spawned terminals (ACP `terminal/*`) rendered with
  xterm.js in a bottom drawer.
- **Attachments** — drag & drop or paste images into the composer; `@path`
  mentions send files as context.
- **Session export** — one click downloads a ZIP with the transcript
  (markdown), raw updates (JSONL) and metadata.
- **Command palette** — `Ctrl/Cmd+K` over sessions and Devin slash commands.
- **Settings** — dark/light/system theme, notification sounds, desktop
  notifications, default model & mode for new sessions.
- **Mobile-friendly** — drawer sidebar, bottom composer, touch targets.

## Requirements

- Node.js ≥ 20
- [Devin CLI](https://docs.devin.ai/cli) installed and authenticated:

```bash
devin auth login
```

Devin Console drives your local `devin` agent — your credentials stay on your
machine, and everything runs against the CLI you already have.

## Usage

```bash
npx devin-web-console            # start on :7781 and open the browser
npx devin-web-console --port 9000 --no-open
```

| Flag        | Default     | Description                          |
| ----------- | ----------- | ------------------------------------ |
| `--port`    | `7781`      | Port to bind (env `PORT`)            |
| `--host`    | `127.0.0.1` | Host to bind                         |
| `--open` / `--no-open` | auto | Open the browser on start   |
| `--version` |             | Print version                        |

Data lives in `~/.devin-console/` (session aliases, settings, usage history,
uploads). Override with `DEVIN_CONSOLE_HOME`.

The server binds to loopback by default. Only use `--host 0.0.0.0` on networks
you trust — there is no authentication layer yet.

## How it works

```
browser (React SPA) ──REST/WS──> devin-console server ──stdio JSON-RPC (ACP)──> devin acp ──> Devin
```

Devin Console spawns one `devin acp` process per workspace directory and speaks
the [Agent Client Protocol](https://agentclientprotocol.com) over stdio — the
same protocol Zed uses to embed coding agents. Session updates stream to the
browser over a WebSocket; your actions (prompts, permission decisions, mode and
model changes) go back over REST. No database, no native modules, no cloud
relay.

## Development

```bash
git clone https://github.com/zouhall/devin-web-console.git
cd devin-web-console
npm install
npm run dev        # server on :7781 (tsx watch) + web on :5173 (vite)
```

```bash
npm run build      # web → dist/web, server → dist/server
npm start          # production server serving dist/web
npm run typecheck  # tsc, both projects
npm run smoke      # end-to-end ACP smoke test against your devin CLI
```

Stack: Node + TypeScript server (`@agentclientprotocol/sdk`, `ws`, `fflate`),
React + Vite frontend ([assistant-ui](https://www.assistant-ui.com/), Tailwind
v4, KaTeX, Mermaid, xterm.js).

## Roadmap

- Token authentication for `--host` exposure
- Interactive terminal input
- Devin Cloud (remote) sessions
- Windows support (today: macOS, Linux, WSL)

## Disclaimer

Devin Console is a community project and is **not affiliated with or endorsed
by Cognition AI**. "Devin" is a trademark of Cognition AI. Requires a valid
Devin account.

## License

[MIT](LICENSE)
