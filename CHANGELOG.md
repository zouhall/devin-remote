# Changelog

## 0.3.1

Hardening release — a full code review of the server and frontend, twice
adversarially re-reviewed. First version published to npm.

- **Security**: CSRF/DNS-rebinding guard on the API and WebSocket — arbitrary
  web pages (including apps on other ports of the same machine) can no longer
  send prompts or approve permission requests. `Origin` must match `Host`
  (port included); `DEVIN_REMOTE_ALLOWED_HOSTS` allows reverse proxies and
  tunnels. Uploads: streamed to disk with a 25 MiB cap, `nosniff`, neutering
  CSP for SVG.
- **Stability**: the server no longer crashes on malformed %-escaped URLs, a
  missing `devin` binary, failed agent commands, disk errors mid-upload, or
  static files swapped mid-request; `waitForExit` callers no longer hang;
  orphaned `devin acp` children are killed on failed handshakes; `store.json`
  writes are atomic; stale permission cards are cleared on timeout/exit;
  WS keepalive pings drop dead connections.
- **Performance**: streaming no longer re-renders the whole thread per chunk
  (selector-based store subscriptions, message conversion caches, memoized
  thread); WS reconnect uses exponential backoff; terminal buffers are capped
  globally.
- **Fixes**: reconnect resync no longer duplicates the timeline; viewing a
  session no longer reorders the sidebar; permission keyboard shortcuts
  respect the busy gate; `~/` file mentions pass through for agent-side
  expansion; Mermaid diagrams no longer vanish during streaming; transcript
  export coalesces streamed chunks into readable messages.

## 0.3.0

Renamed to **Devin Remote** and redesigned to reproduce Devin's own visual language.

- Renamed: package/bin/repo `devin-remote`, data dir `~/.devin-remote` (auto-migrates from `~/.devin-console`), env `DEVIN_REMOTE_HOME`
- Light-first Devin theme: warm cream canvas, white cards, Devin blue accent; dark mode keeps the same palette DNA
- Devin bowtie logo (two hexagons) across sidebar, home, favicon and boot splash
- Devin Local-style composer: rounded-2xl card, mode chip, model name, dark circular send; cwd picker row underneath
- New home screen: centered mark, recent sessions card, quick actions
- Slimmer chat header with segmented mode pill; amber accent removed everywhere

## 0.2.0

Full frontend rebuild on [assistant-ui](https://www.assistant-ui.com/) + Tailwind v4.

- New chat stack: assistant-ui Thread/Composer with our ACP state via ExternalStoreRuntime — reasoning blocks, rich tool-call cards (diffs, durations, locations), plan panel, permission cards with keyboard shortcuts
- New design system: Geist/Geist Mono, dark-first token theme (light + system), single amber accent, skeleton loading states, boot splash, toasts
- Performance: entry chunk 1.1 MB → 84 kB (22 kB brotli); vendor/markdown/xterm chunk splitting, lazy panels, pre-compressed assets served with brotli/gzip
- Fix: session updates no longer clobber a session's cwd

## 0.1.0

First public release.

- Session dashboard across workspaces with resume/replay, search, rename and export
- Streaming chat: markdown + GFM, KaTeX, Mermaid, syntax highlighting, thinking blocks, plans
- Tool-call cards with diffs, terminal output and inline permission prompts
- Devin modes (Code / Ask / Plan / Bypass) and the full model catalog with thinking/speed variants
- Usage view: context gauge, per-turn tokens, daily aggregates
- ACP terminal/* support rendered with xterm.js
- Image attachments, `@path` file mentions, command palette (`Ctrl/Cmd+K`)
- Settings (theme, sounds, desktop notifications, default model/mode), mobile layout
