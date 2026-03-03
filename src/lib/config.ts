import { join } from 'node:path'
import type { ReleaserConfig } from './types.js'

export async function parseReleaserConfig(
  cwd: string,
): Promise<ReleaserConfig | null> {
  const configPath = join(cwd, 'releaser.json')
  const file = Bun.file(configPath)

  if (!(await file.exists())) return null

  let raw: unknown
  try {
    raw = await file.json()
  } catch {
    console.error(`Failed to parse ${configPath}: malformed JSON`)
    return null
  }

  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null

  const obj = raw as Record<string, unknown>
  const config: ReleaserConfig = {}

  if (
    obj.versioning !== undefined &&
    obj.versioning !== 'synchronized' &&
    obj.versioning !== 'independent'
  ) {
    console.error(`Invalid versioning value in ${configPath}: ${String(obj.versioning)}`)
    return null
  }

  if (obj.packages !== undefined) {
    if (typeof obj.packages !== 'object' || obj.packages === null || Array.isArray(obj.packages)) {
      console.error(`Invalid packages value in ${configPath}: expected plain object`)
      return null
    }
    config.packages = obj.packages as ReleaserConfig['packages']
    config.versioning = (obj.versioning as ReleaserConfig['versioning']) || 'synchronized'
  } else if (obj.versioning) {
    config.versioning = obj.versioning as ReleaserConfig['versioning']
  }

  if (obj.hooks) config.hooks = obj.hooks as ReleaserConfig['hooks']

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
