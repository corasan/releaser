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
