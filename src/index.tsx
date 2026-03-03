#!/usr/bin/env bun

import { render } from 'ink'
import pckg from '../package.json'
import { App } from './app.js'
import type { Bump, PreReleaseChannel } from './lib/types.js'

// Handle --version flag
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(`releaser v${pckg.version}`)
  process.exit(0)
}

// Handle --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
  ⚡ Releaser v${pckg.version}

  Zero-config release CLI. Reads your project files and figures out the rest.

  Usage:
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

  How it works:
    1. Detects your project type from the files in your directory
    2. Reads config files (eas.json, tauri.conf.json, etc.) to build options
    3. Walks you through an interactive release flow
    4. Bumps versions, commits, tags, pushes, publishes

  Supported project types:
    npm packages     package.json
    Expo apps        expo in dependencies + eas.json → dynamic profiles
    Tauri apps       src-tauri/ + tauri.conf.json + Cargo.toml
    macOS apps       .xcodeproj / .xcworkspace → auto-detect schemes

  Auto-detected behavior:
    build script     Runs "bun run build" if package.json has a build script
    test script      Runs "bun run test" if package.json has a test script
    gh CLI           Creates GitHub release if gh is installed
    EAS profiles     Shows build profiles from eas.json
    private: true    Skips npm publish for private packages
`)
  process.exit(0)
}

// Parse CLI flags
const args = process.argv.slice(2)
const flags = {
  alpha: args.includes('--alpha'),
  beta: args.includes('--beta'),
  rc: args.includes('--rc'),
  bump: args.includes('--bump'),
  patch: args.includes('--patch'),
  minor: args.includes('--minor'),
  major: args.includes('--major'),
  publish: args.includes('--publish'),
}

// Validate mutually exclusive flags
const channelFlags = [flags.alpha, flags.beta, flags.rc].filter(Boolean)
if (channelFlags.length > 1) {
  console.error('Error: Only one of --alpha, --beta, --rc can be specified')
  process.exit(1)
}

if (flags.bump && channelFlags.length > 0) {
  console.error(
    'Error: --bump cannot be combined with --alpha, --beta, or --rc',
  )
  process.exit(1)
}

const bumpFlags = [flags.patch, flags.minor, flags.major].filter(Boolean)

if (flags.publish && (channelFlags.length > 0 || flags.bump || bumpFlags.length > 0)) {
  console.error('Error: --publish cannot be combined with other flags')
  process.exit(1)
}

if (flags.bump && bumpFlags.length > 0) {
  console.error(
    'Error: --bump cannot be combined with --patch, --minor, or --major',
  )
  process.exit(1)
}
if (bumpFlags.length > 1) {
  console.error('Error: Only one of --patch, --minor, --major can be specified')
  process.exit(1)
}

// Determine CLI overrides
let cliChannel: PreReleaseChannel | undefined
if (flags.alpha) cliChannel = 'alpha'
else if (flags.beta) cliChannel = 'beta'
else if (flags.rc) cliChannel = 'rc'

let cliBump: Bump | undefined
if (flags.patch) cliBump = 'patch'
else if (flags.minor) cliBump = 'minor'
else if (flags.major) cliBump = 'major'

const cliBumpFlag = flags.bump

render(
  <App cliChannel={cliChannel} cliBump={cliBump} cliBumpFlag={cliBumpFlag} publishOnly={flags.publish} />,
)
