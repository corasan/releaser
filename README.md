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

## Install

```bash
bun add -g releaser
```

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
| **npm** | `package.json` | Bump version → commit → tag → push → npm publish → GitHub release |
| **Expo** | `expo` in dependencies | Bump version + app.config → EAS build → submit to stores → GitHub release |
| **Tauri** | `src-tauri/` directory | Bump package.json + tauri.conf.json + Cargo.toml → build → GitHub release |
| **macOS** | `.xcodeproj` / `.xcworkspace` | Bump Info.plist → xcodebuild → notarize → GitHub release |

## Configuration

Create a `releaser.config.ts` in your project root:

```ts
import type { ReleaseConfig } from 'releaser'

export default {
  // Override auto-detected type
  // type: 'npm',

  npm: {
    publish: true,
    access: 'public',
    // registry: 'https://registry.npmjs.org',
  },

  expo: {
    buildPlatform: 'all',    // 'ios' | 'android' | 'all'
    submitToStore: false,
    profile: 'production',
  },

  tauri: {
    build: false,            // Set true to build locally
  },

  macos: {
    scheme: 'MyApp',
    notarize: false,
  },

  github: {
    release: true,
    generateNotes: true,
    draft: false,
  },

  ai: {
    changelog: true,         // Use Claude for changelog generation
  },

  hooks: {
    beforeRelease: 'bun run build && bun test',
    afterRelease: 'echo "Released!"',
  },
} satisfies ReleaseConfig
```

## AI Features

When `@anthropic-ai/claude-code` is installed and authenticated, releaser can:

- **Generate changelogs** from commit history using Claude
- **Suggest version bumps** based on commit message analysis

AI features are optional and gracefully degrade when unavailable.

## Development

```bash
# Run locally
bun run dev

# Type check
bunx tsc --noEmit

# Build standalone binary
bun run compile
```

## License

MIT
