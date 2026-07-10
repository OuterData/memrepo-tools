# memrepo-tools

Validation and engine tooling for the [memrepo format](https://github.com/OuterData/memrepo-spec).

## `memrepo validate`

Lints a memrepo's layout and frontmatter against `memrepo-spec`'s `SPEC.md`. Collects every error in one pass rather than stopping at the first.

```bash
npm install
node ./validate/cli.js /path/to/your/memrepo
```

Exits `0` with no output-worthy errors and prints `OK`; exits `1` and lists every violation found otherwise.

More tooling (CI templates, hook recipes, Adherence Engine gate runner) lands here in later phases — see the parent project's Phase 9 executor brief.
