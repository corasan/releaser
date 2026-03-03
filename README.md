# releaser

Smart release CLI for all your projects — npm packages, Expo apps, Tauri apps, and macOS apps. Supports monorepos, lifecycle hooks, and AI-powered release notes.

```
  ╔══════════════════════════════════╗
  ║ ⚡ Releaser                     ║
  ╚══════════════════════════════════╝

  ✔ Detected: npm package — my-lib (v1.0.0)
  ✔ Version bump: minor (1.0.0 → 1.1.0)

  ┌─ Release Progress ─────────────────┐
  │ ✔ Bump version in package.json     │
  │ ✔ Update CHANGELOG.md              │
  │ ✔ Commit and create tag            │
  │ ⠋ Push to origin...                │
  │ ○ Publish to npm                   │
  │ ○ Create GitHub release            │
  └────────────────────────────────────┘
```

## Prerequisites

- [Bun](https://bun.sh) — required to build and run
- [gh CLI](https://cli.github.com) — optional, enables GitHub releases
- [eas-cli](https://docs.expo.dev/eas/) — optional, required for Expo builds/submissions

## Install

```bash
git clone https://github.com/yourusername/releaser
cd releaser
bun install
bun install-local
```

This compiles a self-contained binary and installs it to `/usr/local/bin/releaser`.

## Usage

Run `releaser` in any project directory:

```bash
releaser
```

The interactive TUI guides you through:

1. **Project detection** — Automatically identifies your project type
2. **Version selection** — Choose patch, minor, or major bump
3. **AI changelog** — Optionally generate a changelog from commits using Claude
4. **Confirmation** — Review the full release plan before executing
5. **Release** — Watch each step execute with real-time progress

### CLI Flags

```
releaser                    Interactive release flow
releaser --patch            Patch release (skip version select)
releaser --minor            Minor release
releaser --major            Major release
releaser --beta --minor     Pre-release: 1.2.3 → 1.3.0-beta.0
releaser --alpha --patch    Alpha: 1.2.3 → 1.2.4-alpha.0
releaser --rc               Promote to RC (from pre-release)
releaser --bump             Bump pre-release: 1.3.0-beta.0 → 1.3.0-beta.1
releaser --publish          Retry npm publish only (skip tag/release)
releaser --version          Show version
releaser --help             Show this help
```

## Configuration (`releaser.json`)

Create a `releaser.json` in your project root to customize behavior. All fields are optional.

```jsonc
{
  "versioning": "synchronized",
  "packages": {
    "packages/core": { "bump": true, "publish": "npm" },
    "packages/cli": { "bump": true, "publish": "npm" },
    "apps/web": { "bump": true, "publish": false }
  },
  "hooks": {
    "preBump": "echo 'About to bump'",
    "postPublish": "notify-team"
  },
  "changelog": true,
  "aiReleaseNotes": true
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `versioning` | `"synchronized" \| "independent"` | `"synchronized"` | How packages are versioned in a monorepo |
| `packages` | `Record<string, PackageConfig>` | — | Per-package bump/publish config |
| `hooks` | `Partial<Record<HookName, string>>` | — | Lifecycle shell commands |
| `changelog` | `boolean` | auto-detect | Write CHANGELOG.md (defaults to `true` if the file already exists) |
| `aiReleaseNotes` | `boolean` | `false` | Use AI for GitHub release notes |

### Package Config

Each entry in `packages` maps a relative path to its config:

| Field | Type | Description |
|-------|------|-------------|
| `bump` | `boolean` | Whether to bump this package's version |
| `publish` | `false \| "npm"` | Publish target — `false` to skip, `"npm"` to publish to npm |

## Monorepo Support

Releaser auto-detects monorepo workspaces from:

- **npm / yarn / bun** — `workspaces` field in root `package.json`
- **pnpm** — `pnpm-workspace.yaml`

### Versioning Strategies

**Synchronized** (default) — All packages share a single version. One bump, one tag, one release.

**Independent** — Each package is versioned separately. You select bump types per-package, and each gets its own changelog and tag (e.g. `@scope/core@1.2.0`).

Set via `releaser.json`:

```json
{ "versioning": "independent" }
```

### Init Wizard

When releaser detects a monorepo without a `releaser.json`, it runs an init wizard that:

1. Lists discovered workspace packages
2. Asks which packages to bump and which to publish
3. Asks for versioning strategy (synchronized or independent)
4. Writes `releaser.json` for you

## Hooks

Releaser supports 6 lifecycle hooks, executed as shell commands in the project root:

| Hook | When it runs |
|------|-------------|
| `preBump` | Before version bump |
| `postBump` | After version bump |
| `prePublish` | Before npm publish |
| `postPublish` | After npm publish |
| `preRelease` | Before git tag + push + GitHub release |
| `postRelease` | After the full release completes |

Execution order: `preBump → postBump → prePublish → postPublish → preRelease → postRelease`

Example:

```json
{
  "hooks": {
    "postBump": "bun run build",
    "postRelease": "curl -X POST https://hooks.slack.com/..."
  }
}
```

## Example Configs

**Simple single package:**

```json
{
  "changelog": true,
  "aiReleaseNotes": true
}
```

**Synchronized monorepo:**

```json
{
  "versioning": "synchronized",
  "packages": {
    "packages/core": { "bump": true, "publish": "npm" },
    "packages/utils": { "bump": true, "publish": "npm" },
    "apps/docs": { "bump": true, "publish": false }
  }
}
```

**Independent monorepo with hooks:**

```json
{
  "versioning": "independent",
  "packages": {
    "packages/sdk": { "bump": true, "publish": "npm" },
    "packages/cli": { "bump": true, "publish": "npm" },
    "packages/config": { "bump": true, "publish": false }
  },
  "hooks": {
    "postBump": "bun run build",
    "prePublish": "bun run test"
  },
  "changelog": true,
  "aiReleaseNotes": true
}
```

## Supported Project Types

| Type | Detection | What it does |
|------|-----------|--------------|
| **npm** | `package.json` | Bump version → run build + tests → commit → tag → push → npm publish → GitHub release |
| **Expo** | `expo` in dependencies | Bump version + app config → EAS build or OTA update → optional store submit → GitHub release |
| **Tauri** | `src-tauri/` directory | Bump package.json + tauri.conf.json + Cargo.toml → optional local build → tag → push → GitHub release |
| **macOS** | `.xcodeproj` / `.xcworkspace` | Detect schemes → optional xcodebuild + notarize → tag → push → GitHub release |

### Expo: Full build vs OTA update

When releasing an Expo app, releaser lets you choose:

- **Full release** — runs `eas build` (creates a new native binary) with optional store submission
- **OTA update** — runs `eas update` (JS-only, no native rebuild required)

Build profiles, update channels, and submit targets are read directly from your `eas.json`.

## AI Features

When `@anthropic-ai/claude-agent-sdk` is installed and authenticated, releaser can:

- **Generate changelogs** from commit history using Claude
- **Generate GitHub release notes** with `"aiReleaseNotes": true` in `releaser.json`
- **Suggest version bumps** based on commit message analysis

AI features are optional and gracefully degrade when unavailable.

## Development

```bash
# Run locally
bun run dev

# Type check
bun run typecheck

# Build standalone binary
bun run compile

# Compile and install to /usr/local/bin
bun run install-local
```

## License

MIT
