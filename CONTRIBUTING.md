# Contributing

Thanks for helping build Devin Remote!

## Setup

```bash
git clone https://github.com/zouhall/devin-remote.git
cd devin-remote
npm install
npm run dev
```

You need the [Devin CLI](https://docs.devin.ai/cli) installed and logged in
(`devin auth login`) for anything beyond the UI shell.

## Useful commands

- `npm run dev` — server (tsx watch, :7781) + web (vite, :5173 with proxy)
- `npm run typecheck` — TypeScript for both server and web (must pass)
- `npm run build` — production build into `dist/`
- `npm run smoke` — end-to-end test against your real `devin acp` (creates a
  throwaway session in a temp dir; costs a few tokens)

## Guidelines

- Keep the server dependency-light and free of native modules — `npx
  devin-remote` must install cleanly everywhere.
- ACP protocol shapes live in `server/src/acp.ts` and `web/src/types.ts`; keep
  them in sync when the protocol surface changes.
- Test against a real Devin CLI before submitting; mocked ACP tests alone
  won't catch protocol drift.
- Small, focused PRs. Open an issue first for anything architectural.

## Reporting issues

Include: `devin version`, `devin-remote --version`, OS, and the browser
console / server logs if the problem is visible there.
