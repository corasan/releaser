# Monorepo Support Design

## Summary

Add monorepo support to releaser via a `releaser.json` config file. Auto-detect workspace roots and prompt users to configure on first run. Support both synchronized and independent versioning strategies, per-package publish control, and hook-based extensibility for custom release steps.

## Config Schema

### Single repo (optional)

```json
{
  "hooks": {
    "preBump": "bun run build",
    "postPublish": "echo done"
  }
}
```

### Monorepo — synchronized versioning

```json
{
  "versioning": "synchronized",
  "packages": {
    "packages/server": { "bump": true, "publish": false },
    "packages/sdk": { "bump": true, "publish": "npm" },
    "packages/cli": { "bump": true, "publish": false }
  },
  "hooks": {
    "preBump": "bun run build:shared",
    "prePublish": "bun run --cwd packages/sdk build",
    "postTag": "scripts/update-homebrew.sh"
  }
}
```

### Monorepo — independent versioning

```json
{
  "versioning": "independent",
  "packages": {
    "packages/api": { "bump": true, "publish": "npm" },
    "packages/cli": { "bump": true, "publish": "npm" }
  }
}
```

### Rules

- No `packages` field = single-repo release (current behavior, unchanged)
- `versioning` defaults to `"synchronized"` when `packages` is present
- `publish`: `false`, `"npm"`, or other targets later (extensible)
- `bump: true` = package.json version gets updated during release
- Hooks are repo-wide, not per-package

## Monorepo Detection & Init Flow

When releaser runs without a `releaser.json`, it checks for workspace indicators:

1. `package.json` → `workspaces` field (npm/yarn/bun)
2. `pnpm-workspace.yaml` (pnpm)

If found, releaser enters an init flow in the TUI:

1. "Detected monorepo with N packages. Configure releaser?" → confirm
2. "Versioning strategy?" → synchronized / independent
3. For each discovered package: "Bump version?" and "Publish?" (private packages default to `bump: true, publish: false`)
4. Write `releaser.json` to the repo root

If no workspace config is found, releaser behaves as today. On subsequent runs, `releaser.json` is the source of truth. The init flow only runs once.

## Release Pipeline

### Synchronized versioning

1. Detect project (read `releaser.json`, resolve all packages)
2. User selects bump type (patch/minor/major) — once for all
3. Dynamic options phase (Expo profiles, etc.)
4. AI changelog (optional, scoped to whole repo)
5. Confirm release plan (shows all packages and what happens to each)
6. Execute pipeline:
   - `preBump` hook
   - Bump version in all `bump: true` packages
   - `postBump` hook
   - Update CHANGELOG.md
   - Git commit + tag (`v1.2.3`)
   - `prePublish` hook
   - Publish each `publish` package
   - `postPublish` hook
   - Push to origin with tags
   - `preRelease` hook
   - Create GitHub release
   - `postRelease` hook
7. Done

### Independent versioning

Differs in steps 2 and 6:

- Step 2: User selects which package(s) to release, then bump type per package
- Step 6: One git commit with all bumps, separate tags per package (`@scope/pkg@1.2.3`), publish only selected packages

### Hook execution points

| Hook | When |
|------|------|
| `preBump` | Before any version files are modified |
| `postBump` | After all versions bumped, before git |
| `prePublish` | After git commit+tag, before npm publish |
| `postPublish` | After all packages published |
| `preRelease` | Before GitHub release creation |
| `postRelease` | After everything is done |

## Code Architecture

### New files

- `src/lib/config.ts` — parse and validate `releaser.json`, define config types
- `src/lib/workspace.ts` — detect workspace roots (npm/yarn/bun/pnpm), resolve package paths
- `src/lib/hooks.ts` — execute hook commands at pipeline points
- `src/components/init-phase.tsx` — TUI for the monorepo init flow

### Modified files

- `src/lib/types.ts` — add `ReleaserConfig`, `PackageConfig`, `VersioningStrategy`, `HookName` types
- `src/lib/detect.ts` — extend `detectProject` to handle multiple packages when config exists
- `src/lib/pipelines/npm.ts` — iterate over publishable packages instead of assuming one
- `src/app.tsx` — add `init` phase before `detect`, wire hooks into pipeline execution
- `src/lib/version.ts` — support bumping multiple package.json files

### Unchanged

- `src/lib/pipelines/expo.ts`, `tauri.ts`, `macos.ts` — monorepo publishing is npm-only for now
- `src/lib/ai.ts`, `src/lib/git.ts` — work the same, scoped to the whole repo
- All existing single-repo behavior — no config = current behavior

### Key principle

Without a `releaser.json`, nothing changes. All monorepo logic is gated behind the config existing.
