# Interop importers (P9.3b)

"Interop, not competition" — both importers below are one-way reads from other tools' existing memory formats into memrepo briefing sources. Neither writes back to the source tool's own storage or repo, and neither is a substitute for using that tool directly if you already do.

## `entire-checkpoints.js`

Reads the `entire/checkpoints/v1` branch from a user's code repo (where [Entire](https://entire.io) stores session data), if present.

**Honest limitation:** Entire's on-disk checkpoint format isn't publicly documented beyond the high-level concept — their README describes *what* gets captured, not the schema. This importer doesn't guess at a structure it can't verify; it lists every text-readable file on that branch and extracts raw content as unverified reference material, clearly labeled as such in its output. If Entire publishes the real schema (or someone reverse-engineers it properly), this should be upgraded to a structured parser.

## `memory-md.js`

Reads a `MEMORY.md` file from a small set of conventional locations (`MEMORY.md`, `.agentmemory/MEMORY.md`, `.memory/MEMORY.md`) if present. No schema uncertainty here — it's plain markdown.

## Both

Runnable standalone for testing (`node entire-checkpoints.js <repo-path>`), or wired into `../run.js` via `MEMREPO_SOURCE_REPO` — when set, the engine runs both automatically and stages anything found to the memrepo's `inbox/` for a future folding pass.
