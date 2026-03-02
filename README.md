# releaser

Smart release CLI for all your projects — npm packages, Expo apps, Tauri apps, and macOS apps.

```
  ╔══════════════════════════════════╗
  ║ ⚡ Releaser v0.1.0              ║
  ╚══════════════════════════════════╝

  ✔ Detected: npm package — my-lib (v0.1.0)
  ✔ Version bump: minor (0.1.0 → 0.2.0)

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
