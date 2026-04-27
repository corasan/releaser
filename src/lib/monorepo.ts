import { join } from 'node:path'
import type { PackageConfig } from './types.js'

async function writePackageVersion(
  cwd: string,
  relativePath: string,
  newVersion: string,
): Promise<void> {
  const pkgPath = join(cwd, relativePath, 'package.json')
  const pkg = await Bun.file(pkgPath).json()
  pkg.version = newVersion
  await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
}

export async function bumpMonorepoVersions(
  cwd: string,
  packages: Record<string, PackageConfig>,
  newVersion: string,
): Promise<string[]> {
  const bumped: string[] = []
  for (const [relativePath, config] of Object.entries(packages)) {
    if (!config.bump) continue
    await writePackageVersion(cwd, relativePath, newVersion)
    bumped.push(relativePath)
  }
  return bumped
}

export async function bumpMonorepoVersionsIndependent(
  cwd: string,
  bumps: Record<string, string>,
): Promise<string[]> {
  const bumpedPaths: string[] = []
  for (const [relativePath, newVersion] of Object.entries(bumps)) {
    await writePackageVersion(cwd, relativePath, newVersion)
    bumpedPaths.push(relativePath)
  }
  return bumpedPaths
}

export function getPublishablePackages(
  packages: Record<string, PackageConfig>,
): string[] {
  return Object.entries(packages)
    .filter(([, config]) => config.publish !== false)
    .map(([path]) => path)
}

/**
 * Pick the package whose package.json version drives a synchronized release.
 * Order: explicit override → first publishable → first bumpable → null.
 */
export function pickVersionSourcePath(
  packages: Record<string, PackageConfig>,
  explicit?: string,
): string | null {
  if (explicit && packages[explicit]) return explicit

  const publishable = Object.entries(packages).find(([, c]) => c.publish !== false)
  if (publishable) return publishable[0]

  const bumpable = Object.entries(packages).find(([, c]) => c.bump)
  if (bumpable) return bumpable[0]

  return null
}
