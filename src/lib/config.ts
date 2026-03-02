import { existsSync } from 'fs'
import { join } from 'path'
import type { ReleaseConfig } from './types.js'

const CONFIG_FILES = [
  'releaser.config.ts',
  'releaser.config.js',
  'releaser.config.json',
]

export async function loadConfig(cwd: string): Promise<ReleaseConfig> {
  for (const file of CONFIG_FILES) {
    const configPath = join(cwd, file)
    if (existsSync(configPath)) {
      try {
        if (file.endsWith('.json')) {
          return await Bun.file(configPath).json()
        }
        const mod = await import(configPath)
        return mod.default || mod
      } catch {
        // Config file exists but failed to load, use defaults
      }
    }
  }

  return getDefaultConfig()
}

function getDefaultConfig(): ReleaseConfig {
  return {
    npm: { publish: true, access: 'public' },
    expo: { buildPlatform: 'all', submitToStore: false, profile: 'production' },
    tauri: { build: false },
    macos: { notarize: false },
    github: { release: true, generateNotes: true, draft: false },
    ai: { changelog: true },
  }
}

export function defineConfig(config: ReleaseConfig): ReleaseConfig {
  return config
}
