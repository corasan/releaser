# Monorepo Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add monorepo support to releaser via `releaser.json` config, workspace auto-detection, hook-based extensibility, and both synchronized and independent versioning strategies.

**Architecture:** A `releaser.json` config file at the repo root is the source of truth for monorepo releases. When absent, releaser behaves exactly as today. When a workspace is detected without a config, an init flow prompts the user to configure. Hooks allow arbitrary shell commands at defined pipeline points.

**Tech Stack:** Bun, TypeScript, React/Ink TUI, bun:test

---

### Task 1: Config Types

**Files:**
- Modify: `src/lib/types.ts:1-86`

**Step 1: Write the failing test**

Create `src/lib/config.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { parseReleaserConfig } from './config.js'

describe('parseReleaserConfig', () => {
  test('returns null for missing config', async () => {
    const result = await parseReleaserConfig('/nonexistent/path')
    expect(result).toBeNull()
  })

  test('parses minimal config with hooks only', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/minimal`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      hooks: { preBump: 'echo hello' }
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result).toEqual({
      hooks: { preBump: 'echo hello' },
    })
    // cleanup
    const { rmdir } = await import('node:fs/promises')
    await Bun.file(`${tmp}/releaser.json`).writer().end()
  })

  test('parses monorepo config with packages', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/monorepo`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      versioning: 'synchronized',
      packages: {
        'packages/sdk': { bump: true, publish: 'npm' },
        'packages/server': { bump: true, publish: false },
      },
      hooks: { prePublish: 'bun run build' }
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result!.versioning).toBe('synchronized')
    expect(result!.packages!['packages/sdk']).toEqual({ bump: true, publish: 'npm' })
    expect(result!.packages!['packages/server']).toEqual({ bump: true, publish: false })
  })

  test('defaults versioning to synchronized when packages present', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/default-versioning`
    await Bun.write(`${tmp}/releaser.json`, JSON.stringify({
      packages: {
        'packages/a': { bump: true, publish: false },
      }
    }))
    const result = await parseReleaserConfig(tmp)
    expect(result!.versioning).toBe('synchronized')
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/config.test.ts`
Expected: FAIL — `parseReleaserConfig` not found

**Step 3: Add types to `src/lib/types.ts`**

Append after line 86:

```typescript
// ─── Releaser config (releaser.json) ─────────────────────────────

export type VersioningStrategy = 'synchronized' | 'independent'

export type PublishTarget = false | 'npm'

export interface PackageConfig {
  bump: boolean
  publish: PublishTarget
}

export type HookName =
  | 'preBump'
  | 'postBump'
  | 'prePublish'
  | 'postPublish'
  | 'preRelease'
  | 'postRelease'

export interface ReleaserConfig {
  versioning?: VersioningStrategy
  packages?: Record<string, PackageConfig>
  hooks?: Partial<Record<HookName, string>>
}
```

**Step 4: Create `src/lib/config.ts`**

```typescript
import { join } from 'node:path'
import type { ReleaserConfig } from './types.js'

export async function parseReleaserConfig(
  cwd: string,
): Promise<ReleaserConfig | null> {
  const configPath = join(cwd, 'releaser.json')
  const file = Bun.file(configPath)

  if (!(await file.exists())) return null

  const raw = await file.json()
  const config: ReleaserConfig = {}

  if (raw.hooks) config.hooks = raw.hooks
  if (raw.packages) {
    config.packages = raw.packages
    config.versioning = raw.versioning || 'synchronized'
  }
  if (raw.versioning && !raw.packages) {
    config.versioning = raw.versioning
  }

  return config
}

export function isMonorepoConfig(config: ReleaserConfig): boolean {
  return !!config.packages && Object.keys(config.packages).length > 0
}

export async function writeReleaserConfig(
  cwd: string,
  config: ReleaserConfig,
): Promise<void> {
  const configPath = join(cwd, 'releaser.json')
  await Bun.write(configPath, `${JSON.stringify(config, null, 2)}\n`)
}
```

**Step 5: Run test to verify it passes**

Run: `bun test src/lib/config.test.ts`
Expected: PASS

**Step 6: Commit**

```bash
git add src/lib/types.ts src/lib/config.ts src/lib/config.test.ts
git commit -m "feat: add releaser config types and parser"
```

---

### Task 2: Workspace Detection

**Files:**
- Create: `src/lib/workspace.ts`
- Create: `src/lib/workspace.test.ts`

**Step 1: Write the failing test**

Create `src/lib/workspace.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { detectWorkspaces, resolveWorkspacePackages } from './workspace.js'

describe('detectWorkspaces', () => {
  test('detects npm/bun workspaces from package.json', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/ws-npm`
    await Bun.write(`${tmp}/package.json`, JSON.stringify({
      name: 'monorepo',
      private: true,
      workspaces: ['packages/*']
    }))
    const result = await detectWorkspaces(tmp)
    expect(result).toEqual({ type: 'npm', patterns: ['packages/*'] })
  })

  test('detects pnpm workspaces', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/ws-pnpm`
    await Bun.write(`${tmp}/pnpm-workspace.yaml`, 'packages:\n  - "packages/*"\n')
    const result = await detectWorkspaces(tmp)
    expect(result).toEqual({ type: 'pnpm', patterns: ['packages/*'] })
  })

  test('returns null for non-workspace project', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/ws-none`
    await Bun.write(`${tmp}/package.json`, JSON.stringify({
      name: 'single-pkg',
      version: '1.0.0'
    }))
    const result = await detectWorkspaces(tmp)
    expect(result).toBeNull()
  })
})

describe('resolveWorkspacePackages', () => {
  test('resolves glob patterns to package paths', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/ws-resolve`
    // Create workspace structure
    await Bun.write(`${tmp}/package.json`, JSON.stringify({
      workspaces: ['packages/*']
    }))
    await Bun.write(`${tmp}/packages/sdk/package.json`, JSON.stringify({
      name: '@scope/sdk', version: '1.0.0'
    }))
    await Bun.write(`${tmp}/packages/cli/package.json`, JSON.stringify({
      name: '@scope/cli', version: '1.0.0', private: true
    }))
    const packages = await resolveWorkspacePackages(tmp, ['packages/*'])
    expect(packages).toHaveLength(2)
    expect(packages.map(p => p.name).sort()).toEqual(['@scope/cli', '@scope/sdk'])

    const sdk = packages.find(p => p.name === '@scope/sdk')!
    expect(sdk.private).toBe(false)
    expect(sdk.relativePath).toBe('packages/sdk')

    const cli = packages.find(p => p.name === '@scope/cli')!
    expect(cli.private).toBe(true)
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/workspace.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/lib/workspace.ts`:

```typescript
import { join } from 'node:path'

export interface WorkspaceInfo {
  type: 'npm' | 'pnpm'
  patterns: string[]
}

export interface WorkspacePackage {
  name: string
  version: string
  private: boolean
  relativePath: string
  absolutePath: string
}

export async function detectWorkspaces(
  cwd: string,
): Promise<WorkspaceInfo | null> {
  // Check package.json workspaces (npm/yarn/bun)
  const pkgPath = join(cwd, 'package.json')
  if (await Bun.file(pkgPath).exists()) {
    const pkg = await Bun.file(pkgPath).json()
    if (Array.isArray(pkg.workspaces)) {
      return { type: 'npm', patterns: pkg.workspaces }
    }
    if (pkg.workspaces?.packages) {
      return { type: 'npm', patterns: pkg.workspaces.packages }
    }
  }

  // Check pnpm-workspace.yaml
  const pnpmPath = join(cwd, 'pnpm-workspace.yaml')
  if (await Bun.file(pnpmPath).exists()) {
    const content = await Bun.file(pnpmPath).text()
    const patterns = parsePnpmWorkspaceYaml(content)
    if (patterns.length > 0) {
      return { type: 'pnpm', patterns }
    }
  }

  return null
}

export async function resolveWorkspacePackages(
  cwd: string,
  patterns: string[],
): Promise<WorkspacePackage[]> {
  const packages: WorkspacePackage[] = []

  for (const pattern of patterns) {
    const glob = new Bun.Glob(`${pattern}/package.json`)
    for await (const match of glob.scan({ cwd, onlyFiles: true })) {
      const absolutePath = join(cwd, match)
      const pkg = await Bun.file(absolutePath).json()
      const relativePath = match.replace('/package.json', '')
      packages.push({
        name: pkg.name || relativePath,
        version: pkg.version || '0.0.0',
        private: pkg.private || false,
        relativePath,
        absolutePath: join(cwd, relativePath),
      })
    }
  }

  return packages.sort((a, b) => a.relativePath.localeCompare(b.relativePath))
}

function parsePnpmWorkspaceYaml(content: string): string[] {
  const patterns: string[] = []
  const lines = content.split('\n')
  let inPackages = false

  for (const line of lines) {
    if (line.trim() === 'packages:') {
      inPackages = true
      continue
    }
    if (inPackages) {
      const match = line.match(/^\s+-\s+['"]?([^'"]+)['"]?$/)
      if (match) {
        patterns.push(match[1])
      } else if (line.trim() && !line.startsWith(' ') && !line.startsWith('\t')) {
        break // new top-level key
      }
    }
  }

  return patterns
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/workspace.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/workspace.ts src/lib/workspace.test.ts
git commit -m "feat: add workspace detection for monorepos"
```

---

### Task 3: Hook Execution

**Files:**
- Create: `src/lib/hooks.ts`
- Create: `src/lib/hooks.test.ts`

**Step 1: Write the failing test**

Create `src/lib/hooks.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import type { ReleaserConfig } from './types.js'
import { runHook } from './hooks.js'

describe('runHook', () => {
  test('runs a configured hook command', async () => {
    const config: ReleaserConfig = {
      hooks: { preBump: 'echo "hello"' }
    }
    // Should not throw
    await runHook('preBump', config, process.cwd())
  })

  test('skips when hook is not configured', async () => {
    const config: ReleaserConfig = {}
    // Should not throw
    await runHook('preBump', config, process.cwd())
  })

  test('skips when config is null', async () => {
    await runHook('preBump', null, process.cwd())
  })

  test('throws on hook failure', async () => {
    const config: ReleaserConfig = {
      hooks: { preBump: 'exit 1' }
    }
    expect(runHook('preBump', config, process.cwd())).rejects.toThrow()
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/hooks.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/lib/hooks.ts`:

```typescript
import { $ } from 'bun'
import type { HookName, ReleaserConfig } from './types.js'

export async function runHook(
  name: HookName,
  config: ReleaserConfig | null,
  cwd: string,
): Promise<void> {
  const command = config?.hooks?.[name]
  if (!command) return

  await $`sh -c ${command}`.cwd(cwd)
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/hooks.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/hooks.ts src/lib/hooks.test.ts
git commit -m "feat: add hook execution for release pipeline"
```

---

### Task 4: Wire Hooks into npm Pipeline

**Files:**
- Modify: `src/lib/types.ts:71-80` (add `releaserConfig` to `ReleaseContext`)
- Modify: `src/lib/pipelines/npm.ts` (add hook steps)
- Modify: `src/app.tsx` (pass config through context)

**Step 1: Add `releaserConfig` to `ReleaseContext`**

In `src/lib/types.ts`, modify `ReleaseContext`:

```typescript
export interface ReleaseContext {
  project: ProjectInfo
  bump: Bump
  newVersion: string
  tag: string
  env: DetectedEnv
  answers: Answers
  projectConfig: ParsedProjectConfig
  changelog?: string
  releaserConfig: ReleaserConfig | null
}
```

**Step 2: Update `src/lib/pipelines/npm.ts` to insert hook steps**

Add hook pipeline steps at the appropriate positions. Import `runHook` from `../hooks.js`.

Insert these hook steps into `getNpmSteps`:
- `preBump` hook step before the `bump-version` step
- `postBump` hook step after `bump-version`, before `changelog`
- `prePublish` hook step before `npm-publish`
- `postPublish` hook step after `npm-publish`
- `preRelease` hook step before `github-release`
- `postRelease` hook step after `github-release`

Each hook step:
```typescript
{
  id: 'hook-preBump',
  label: 'Run preBump hook',
  execute: async ctx => {
    await runHook('preBump', ctx.releaserConfig, ctx.project.path)
  },
  skip: ctx => !ctx.releaserConfig?.hooks?.preBump,
}
```

**Step 3: Update `src/app.tsx`**

- Import `parseReleaserConfig` from `./lib/config.js`
- Add state: `const [releaserConfig, setReleaserConfig] = useState<ReleaserConfig | null>(null)`
- In `DetectPhase` callback or after detect, load the config: `const rc = await parseReleaserConfig(cwd)`
- Pass `releaserConfig` into `ReleaseContext` in `buildContextAndConfirm`

**Step 4: Run all tests to verify nothing broke**

Run: `bun test`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/types.ts src/lib/pipelines/npm.ts src/app.tsx
git commit -m "feat: wire hooks into npm release pipeline"
```

---

### Task 5: Monorepo Version Bumping

**Files:**
- Create: `src/lib/monorepo.ts`
- Create: `src/lib/monorepo.test.ts`

**Step 1: Write the failing test**

Create `src/lib/monorepo.test.ts`:

```typescript
import { describe, expect, test } from 'bun:test'
import { bumpMonorepoVersions } from './monorepo.js'

describe('bumpMonorepoVersions', () => {
  test('bumps version in all configured packages', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/mono-bump`
    await Bun.write(`${tmp}/packages/a/package.json`, JSON.stringify({
      name: 'a', version: '1.0.0'
    }))
    await Bun.write(`${tmp}/packages/b/package.json`, JSON.stringify({
      name: 'b', version: '1.0.0'
    }))

    await bumpMonorepoVersions(tmp, {
      'packages/a': { bump: true, publish: false },
      'packages/b': { bump: true, publish: 'npm' },
    }, '1.1.0')

    const a = await Bun.file(`${tmp}/packages/a/package.json`).json()
    const b = await Bun.file(`${tmp}/packages/b/package.json`).json()
    expect(a.version).toBe('1.1.0')
    expect(b.version).toBe('1.1.0')
  })

  test('skips packages with bump: false', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/mono-skip`
    await Bun.write(`${tmp}/packages/a/package.json`, JSON.stringify({
      name: 'a', version: '1.0.0'
    }))

    await bumpMonorepoVersions(tmp, {
      'packages/a': { bump: false, publish: false },
    }, '2.0.0')

    const a = await Bun.file(`${tmp}/packages/a/package.json`).json()
    expect(a.version).toBe('1.0.0')
  })

  test('returns list of bumped package paths', async () => {
    const tmp = `${import.meta.dir}/__fixtures__/mono-result`
    await Bun.write(`${tmp}/packages/x/package.json`, JSON.stringify({
      name: 'x', version: '0.1.0'
    }))

    const bumped = await bumpMonorepoVersions(tmp, {
      'packages/x': { bump: true, publish: false },
    }, '0.2.0')

    expect(bumped).toEqual(['packages/x'])
  })
})
```

**Step 2: Run test to verify it fails**

Run: `bun test src/lib/monorepo.test.ts`
Expected: FAIL — module not found

**Step 3: Write implementation**

Create `src/lib/monorepo.ts`:

```typescript
import { join } from 'node:path'
import type { PackageConfig } from './types.js'

export async function bumpMonorepoVersions(
  cwd: string,
  packages: Record<string, PackageConfig>,
  newVersion: string,
): Promise<string[]> {
  const bumped: string[] = []

  for (const [relativePath, config] of Object.entries(packages)) {
    if (!config.bump) continue

    const pkgPath = join(cwd, relativePath, 'package.json')
    const pkg = await Bun.file(pkgPath).json()
    pkg.version = newVersion
    await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    bumped.push(relativePath)
  }

  return bumped
}

export function getPublishablePackages(
  packages: Record<string, PackageConfig>,
): string[] {
  return Object.entries(packages)
    .filter(([, config]) => config.publish !== false)
    .map(([path]) => path)
}
```

**Step 4: Run test to verify it passes**

Run: `bun test src/lib/monorepo.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/lib/monorepo.ts src/lib/monorepo.test.ts
git commit -m "feat: add monorepo version bumping"
```

---

### Task 6: Monorepo Pipeline Steps

**Files:**
- Modify: `src/lib/pipelines/npm.ts` (add monorepo-aware bump + publish steps)
- Modify: `src/lib/pipelines/index.ts` (route monorepo configs)

**Step 1: Add monorepo-aware steps to npm pipeline**

In `src/lib/pipelines/npm.ts`, modify the `bump-version` step to check if `ctx.releaserConfig` has `packages`. If it does, call `bumpMonorepoVersions` instead of bumping a single `package.json`. Similarly, modify the `npm-publish` step to iterate over publishable packages.

Replace the existing bump-version step with logic like:

```typescript
steps.push({
  id: 'bump-version',
  label: isMonorepo ? 'Bump version in all packages' : 'Bump version in package.json',
  execute: async ctx => {
    if (ctx.releaserConfig?.packages) {
      await bumpMonorepoVersions(ctx.project.path, ctx.releaserConfig.packages, ctx.newVersion)
    } else {
      const pkgPath = join(ctx.project.path, 'package.json')
      const pkg = await Bun.file(pkgPath).json()
      pkg.version = ctx.newVersion
      await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    }
  },
})
```

Replace the existing npm-publish step with:

```typescript
if (ctx.releaserConfig?.packages) {
  const publishable = getPublishablePackages(ctx.releaserConfig.packages)
  for (const pkgPath of publishable) {
    steps.push({
      id: `npm-publish-${pkgPath}`,
      label: `Publish ${pkgPath}`,
      execute: async ctx => {
        await $`npm publish`.cwd(join(ctx.project.path, pkgPath))
      },
    })
  }
} else if (!ctx.project.npm?.private) {
  steps.push({
    id: 'npm-publish',
    label: 'Publish to npm',
    execute: async ctx => {
      await $`npm publish`.cwd(ctx.project.path)
    },
  })
}
```

Also update the `commit-tag` step to git-add all bumped package.json files (not just root).

**Step 2: Run all tests**

Run: `bun test`
Expected: PASS

**Step 3: Commit**

```bash
git add src/lib/pipelines/npm.ts src/lib/pipelines/index.ts
git commit -m "feat: monorepo-aware bump and publish pipeline steps"
```

---

### Task 7: Workspace Init Phase (TUI)

**Files:**
- Create: `src/components/init-phase.tsx`
- Modify: `src/app.tsx` (add `init` phase)

**Step 1: Create `src/components/init-phase.tsx`**

This component:
1. Shows "Detected monorepo with N packages"
2. Asks "Configure releaser?" (confirm)
3. Asks versioning strategy (select: synchronized / independent)
4. For each package, asks bump and publish (with smart defaults: private → publish false)
5. Writes `releaser.json` and calls `onComplete(config)`

Use `ink-select-input` for selection and `useState` for multi-step flow within the component.

```typescript
import { Box, Text, useInput } from 'ink'
import SelectInput from 'ink-select-input'
import { useState } from 'react'
import type { ReleaserConfig, VersioningStrategy } from '../lib/types.js'
import type { WorkspacePackage } from '../lib/workspace.js'
import { writeReleaserConfig } from '../lib/config.js'

interface InitPhaseProps {
  cwd: string
  packages: WorkspacePackage[]
  onComplete: (config: ReleaserConfig) => void
  onSkip: () => void
}
```

Build the component as a multi-step wizard: confirm → versioning → per-package config → write file.

**Step 2: Wire into `src/app.tsx`**

- Add `'init'` to the `Phase` type
- Add state for workspace detection results
- In `DetectPhase` callback: after `detectProject`, check `detectWorkspaces`. If workspace found and no `releaser.json` exists, set phase to `'init'`
- Render `<InitPhase>` when `phase === 'init'`
- On init complete, store the config and continue to `'version'` phase

**Step 3: Test manually**

Run `bun run dev` in a monorepo directory (like grove) without a `releaser.json` to verify the init flow works.

**Step 4: Commit**

```bash
git add src/components/init-phase.tsx src/app.tsx
git commit -m "feat: add monorepo init phase TUI"
```

---

### Task 8: Detect Phase Monorepo Support

**Files:**
- Modify: `src/components/detect-phase.tsx`
- Modify: `src/lib/detect.ts`

**Step 1: Update detect to read `releaser.json`**

In `src/components/detect-phase.tsx`, after calling `detectProject(cwd)`, also call `parseReleaserConfig(cwd)`. If the config has `packages`, read the version from the first `bump: true` package (for synchronized) as the canonical version displayed in the TUI.

**Step 2: Update `DetectedBadge` to show monorepo info**

When a monorepo config is present, show something like:
```
✔ Detected: monorepo — 3 packages (v1.2.3)
```

Instead of:
```
✔ Detected: npm package — my-pkg (v1.2.3)
```

**Step 3: Run all tests**

Run: `bun test`
Expected: PASS

**Step 4: Commit**

```bash
git add src/components/detect-phase.tsx src/lib/detect.ts
git commit -m "feat: detect phase shows monorepo info"
```

---

### Task 9: Independent Versioning Support

**Files:**
- Create: `src/components/package-select.tsx`
- Modify: `src/app.tsx`
- Modify: `src/lib/monorepo.ts`

**Step 1: Create package selection component**

Create `src/components/package-select.tsx` — a TUI component for independent versioning that:
1. Lists all packages with checkboxes (multi-select)
2. For each selected package, asks bump type (patch/minor/major)
3. Returns a map of `{ [packagePath]: { bump: Bump, newVersion: string } }`

**Step 2: Wire into app.tsx**

When `releaserConfig.versioning === 'independent'`, insert the package-select phase between detect and version phases. The version phase is skipped (bump is per-package). The pipeline gets per-package bump info from the answers.

**Step 3: Update monorepo.ts for independent bumping**

Add `bumpMonorepoVersionsIndependent` that takes per-package versions:

```typescript
export async function bumpMonorepoVersionsIndependent(
  cwd: string,
  bumps: Record<string, string>, // { 'packages/sdk': '1.2.0', 'packages/cli': '2.0.0' }
): Promise<string[]> {
  const bumped: string[] = []
  for (const [relativePath, newVersion] of Object.entries(bumps)) {
    const pkgPath = join(cwd, relativePath, 'package.json')
    const pkg = await Bun.file(pkgPath).json()
    pkg.version = newVersion
    await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    bumped.push(relativePath)
  }
  return bumped
}
```

**Step 4: Update git tagging for independent mode**

In the commit-tag step, when independent versioning, create tags like `@scope/pkg@1.2.0` instead of `v1.2.0`.

**Step 5: Run all tests**

Run: `bun test`
Expected: PASS

**Step 6: Commit**

```bash
git add src/components/package-select.tsx src/app.tsx src/lib/monorepo.ts
git commit -m "feat: add independent versioning for monorepos"
```

---

### Task 10: Cleanup Test Fixtures & Final Verification

**Files:**
- Modify: test files to clean up fixture directories

**Step 1: Add fixture cleanup**

Add `afterAll` or `afterEach` blocks to test files that create fixture directories to ensure cleanup. Alternatively, use `os.tmpdir()` for fixture locations.

**Step 2: Run full test suite**

Run: `bun test`
Expected: All PASS

**Step 3: Run linter and type checker**

Run: `bun run typecheck && bun run lint`
Expected: PASS

**Step 4: Manual smoke test**

1. Run `bun run dev` in a non-monorepo — verify current behavior unchanged
2. Run `bun run dev` in grove — verify init flow detects 4 packages, generates `releaser.json`
3. Run `bun run dev` in grove again — verify it reads the config and shows monorepo pipeline

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: cleanup test fixtures and finalize monorepo support"
```
