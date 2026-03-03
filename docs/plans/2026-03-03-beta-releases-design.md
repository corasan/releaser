# Beta Releases Design

## Overview

Add pre-release support (alpha, beta, rc) to releaser via CLI flags and an interactive TUI menu.

## Pre-release Channels

- `alpha` — early development
- `beta` — feature-complete testing
- `rc` — release candidate, final validation

## Version Bumping Logic

Extend `version.ts` with pre-release semver parsing and bumping.

```
parseVersion("1.3.0-beta.2") → { major:1, minor:3, patch:0, preRelease: { channel:'beta', num:2 } }
parseVersion("1.2.3")        → { major:1, minor:2, patch:3, preRelease: null }
```

### From stable → pre-release (requires base bump)

```
bumpPreRelease("1.2.3", 'minor', 'beta')  → "1.3.0-beta.0"
bumpPreRelease("1.2.3", 'patch', 'alpha') → "1.2.4-alpha.0"
```

### From pre-release → bump same channel

```
bumpPreRelease("1.3.0-beta.0", null, 'beta')  → "1.3.0-beta.1"
```

### From pre-release → promote channel

```
bumpPreRelease("1.3.0-beta.2", null, 'rc') → "1.3.0-rc.0"
```

### From pre-release → stable

```
bumpToStable("1.3.0-rc.1") → "1.3.0"
```

## TUI Flow

### From stable version (e.g. 1.2.3)

```
How do you want to release?
> Stable
  Pre-release

── Stable selected ──
> patch   1.2.3 → 1.2.4
  minor   1.2.3 → 1.3.0
  major   1.2.3 → 2.0.0

── Pre-release selected ──
Which base version?
> patch   (1.2.4-*.0)
  minor   (1.3.0-*.0)
  major   (2.0.0-*.0)

Which channel?
> alpha   1.3.0-alpha.0
  beta    1.3.0-beta.0
  rc      1.3.0-rc.0
```

### From pre-release version (e.g. 1.3.0-beta.2)

```
How do you want to release?
> Bump beta        1.3.0-beta.3
  Promote to rc    1.3.0-rc.0
  Release stable   1.3.0
```

When already on a pre-release, the menu is simplified since the target version is already established.

## CLI Flags

New flags:
- `--alpha`, `--beta`, `--rc` — set pre-release channel
- `--bump` — bump current pre-release number

### Validation rules

- `--alpha/--beta/--rc` from stable requires `--patch/--minor/--major`
- `--alpha/--beta/--rc` from pre-release doesn't need a base bump (uses existing base)
- `--bump` only valid when already on a pre-release
- `--bump` conflicts with `--alpha/--beta/--rc`

### Examples

```
releaser --beta --minor       # 1.2.3 → 1.3.0-beta.0
releaser --beta --patch       # 1.2.3 → 1.2.4-beta.0
releaser --beta               # from stable → error: specify --patch/--minor/--major
releaser --bump               # 1.3.0-beta.0 → 1.3.0-beta.1
releaser --rc                 # 1.3.0-beta.1 → 1.3.0-rc.0
```

## npm Publish

Pre-releases publish with dist-tag matching the channel:

```
npm publish --tag beta    # for 1.3.0-beta.0
npm publish --tag alpha   # for 1.3.0-alpha.0
npm publish --tag rc      # for 1.3.0-rc.0
```

This keeps `latest` pointing to the last stable release.

## Git Tags

Same format as today: `v1.3.0-beta.0`. Semver pre-release is already valid in git tags.

## Scope

- Single-package and synchronized monorepo only
- Independent monorepo pre-releases deferred
- All project types (npm, Expo, Tauri, macOS)
