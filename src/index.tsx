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

  Zero-config release CLI. Reads your project files and figures out the rest.

  Usage:
    releaser              Interactive release flow
    releaser --version    Show version
    releaser --help       Show this help

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

render(<App />)
