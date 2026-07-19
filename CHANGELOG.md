# Changelog

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
