#!/usr/bin/env bun

import { render } from 'ink'
import React from 'react'
import { App } from './app.js'

// Handle --version flag
if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log('releaser v0.1.0')
  process.exit(0)
}

// Handle --help flag
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
  ⚡ Releaser v0.1.0

  Smart release CLI for npm, Expo, Tauri, and macOS projects.

  Usage:
    releaser              Interactive release flow
    releaser --version    Show version
    releaser --help       Show this help

  Configuration:
    Create a releaser.config.ts in your project root:

    export default {
      npm: { publish: true, access: 'public' },
      github: { release: true },
      ai: { changelog: true },
      hooks: {
        beforeRelease: 'bun run build && bun test',
      },
    }

  Supported project types:
    • npm packages     Detected via package.json
    • Expo apps        Detected via expo dependency + app.config.ts
    • Tauri apps       Detected via src-tauri/ directory
    • macOS apps       Detected via .xcodeproj/.xcworkspace

  AI Features (optional):
    When @anthropic-ai/claude-code is installed, releaser can
    generate changelogs from commit history using Claude.
`)
  process.exit(0)
}

render(<App />)
