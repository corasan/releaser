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
  try {
    const pkg = await Bun.file(join(cwd, 'package.json')).json()
    if (Array.isArray(pkg.workspaces)) {
      return { type: 'npm', patterns: pkg.workspaces }
    }
    if (pkg.workspaces?.packages) {
      return { type: 'npm', patterns: pkg.workspaces.packages }
    }
  } catch {
    // No package.json or invalid JSON
  }

  // Check pnpm-workspace.yaml
  try {
    const content = await Bun.file(join(cwd, 'pnpm-workspace.yaml')).text()
    const patterns = parsePnpmWorkspaceYaml(content)
    if (patterns.length > 0) {
      return { type: 'pnpm', patterns }
    }
  } catch {
    // No pnpm-workspace.yaml
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
      const relativePath = match.replace('/package.json', '')
      const absolutePath = join(cwd, relativePath)
      const pkg = await Bun.file(join(cwd, match)).json()
      packages.push({
        name: pkg.name || relativePath,
        version: pkg.version || '0.0.0',
        private: pkg.private || false,
        relativePath,
        absolutePath,
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
