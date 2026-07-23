# memrepo-tools

Validation and engine tooling for the [memrepo format](https://github.com/OuterData/memrepo-spec) — including the Adherence Engine's gate runner: a hard-stop-and-retry enforcement mechanism that blocks a violating write before it lands and refuses to finish while a check is red, running entirely on your own machine against your own memrepo, no proxy or vendor server involved.

**Nothing to install beyond cloning this repo once**, plus whichever of `bash`/`node` your setup already needs (both are standard on any dev machine these hook recipes target). No npm-installable package — these are scripts you clone and reference by path from your AI tool's own hook config, not a library dependency.

## Quickstart: a working gate, start to finish

1. Clone this repo somewhere stable: `git clone https://github.com/OuterData/memrepo-tools ~/.outerbot/memrepo-tools`, then `cd ~/.outerbot/memrepo-tools && npm install` (installs `js-yaml`/`minimatch`, the only two runtime dependencies the gate runner and validator need).
2. Make sure your memrepo is cloned at `~/.outerbot/memrepo` (see [`memrepo-spec`](https://github.com/OuterData/memrepo-spec) for what a memrepo is and how outer.bot provisions one).
3. Add at least one `tier: gate` rule to `~/.outerbot/memrepo/projects/{your-project-slug}/rules.yaml`:
   ```yaml
   - id: no-console-log
     rule: "Never commit console.log statements to src/ -- use the logger module instead."
     tier: gate
     check: "! grep -rn 'console.log' src/"
     scope: ["src/**"]
     origin: "manual"
     on_fail: block
   ```
4. Copy the relevant hook recipe for your tool from [`hooks/`](./hooks/) — see [`hooks/README.md`](./hooks/README.md) for the full per-tool coverage table (which capabilities each tool's recipe actually delivers; not every tool supports the full gate/retry ladder).
5. Ask your AI assistant to write a file under `src/` containing `console.log(...)`. It should be refused before the write lands, see the rule text, and correct itself.

That's the same path this repo's own Claude Code recipe was live-verified against — a real nested session, a real block, a real correction, a real `drift-ledger.md` entry on a forced non-convergent case. See the repo's commit history for the transcript-backed writeup.

## `memrepo validate`

Lints a memrepo's layout and frontmatter against `memrepo-spec`'s `SPEC.md`. Collects every error in one pass rather than stopping at the first.

```bash
node ./validate/cli.js /path/to/your/memrepo
```

Exits `0` with no output-worthy errors and prints `OK`; exits `1` and lists every violation found otherwise.

## What's here

- [`gates/`](./gates/) — the Adherence Engine's gate runner: `pretooluse.js` (blocks a violating write before it happens), `stop.js` (refuses to finish while a check is red, retries up to `MEMREPO_GATE_MAX_PASSES`, escalates non-convergence to `drift-ledger.md`), `drift-ledger.js` (the shared ledger + `adherence-stats.json` writer — same format as `outer.bot`'s server-side implementation, documented in `memrepo-spec`'s SPEC.md §9).
- [`hooks/`](./hooks/) — copy-paste hook recipes per AI tool (Claude Code, Cursor, Cline, Codex CLI, GitHub Copilot fully wired for gates; Continue/Aider proxy-mode-only; Devin Desktop unreachable today — see `hooks/README.md`'s coverage table for exactly what each tool's recipe delivers).
- [`validate/`](./validate/) — the `rules.yaml`/`briefing.md`/`manifest.yaml`/skill frontmatter linter described above.
- [`engine/`](./engine/) — a portable CLI proving the same scheduling plumbing works identically from GitHub Actions, GitLab CI, or a bare cron job (`ci/` has templates for all three). Its core extraction/folding logic (reading `/inbox/`, producing briefing/rules.yaml/skills updates) is a placeholder, not yet built. The two interop importers (`engine/importers/`) are real, working, one-way capture tools.

## Status

Built in a single pass (2026-07-10/11) alongside `outer.bot`'s server-side Adherence Engine, then left with its gate runner unwired from any published recipe until 2026-07-23 — see that commit's message for the full story. `memrepo validate` and the gate runners are the load-bearing, real-tested pieces; `engine/`'s core loop is intentionally unfinished.
