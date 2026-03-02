import { $ } from 'bun'
import { existsSync } from 'fs'
import { readdir } from 'fs/promises'
import { join } from 'path'
import type { DetectedEnv, ProjectInfo } from './types.js'

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const pkgPath = join(cwd, 'package.json')
  let pkg: Record<string, any> | null = null

  if (existsSync(pkgPath)) {
    pkg = await Bun.file(pkgPath).json()
  }

  // Check for Expo (must come before generic npm check)
  if (pkg && (pkg.dependencies?.expo || pkg.devDependencies?.expo)) {
    const appConfigTs = join(cwd, 'app.config.ts')
    const appConfigJs = join(cwd, 'app.config.js')
    const appConfig = existsSync(appConfigTs)
      ? 'app.config.ts'
      : existsSync(appConfigJs)
        ? 'app.config.js'
        : 'app.json'

    return {
      type: 'expo',
      name: pkg.name || 'expo-app',
      version: pkg.version || '0.0.0',
      path: cwd,
      expo: {
        easConfigured: existsSync(join(cwd, 'eas.json')),
        appConfig,
      },
    }
  }

  // Check for Tauri
  const tauriConf = join(cwd, 'src-tauri', 'tauri.conf.json')
  const srcTauriDir = join(cwd, 'src-tauri')

  if (existsSync(srcTauriDir)) {
    const tauriVersion = existsSync(join(srcTauriDir, 'Cargo.toml')) ? 2 : 1
    return {
      type: 'tauri',
      name: pkg?.name || 'tauri-app',
      version: pkg?.version || '0.0.0',
      path: cwd,
      tauri: {
        configPath: existsSync(tauriConf) ? tauriConf : join(srcTauriDir, 'tauri.conf.json'),
        version: tauriVersion,
      },
    }
  }

  // Check for macOS app (Xcode project)
  try {
    const files = await readdir(cwd)
    const xcodeProject = files.find(
      f => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace'),
    )
    if (xcodeProject) {
      const schemes = await detectXcodeSchemes(join(cwd, xcodeProject))
      return {
        type: 'macos',
        name: xcodeProject.replace(/\.(xcodeproj|xcworkspace)$/, ''),
        version: '0.0.0',
        path: cwd,
        macos: {
          xcodeProject: join(cwd, xcodeProject),
          schemes,
        },
      }
    }
  } catch {
    // readdir failed, continue
  }

  // Default to npm if package.json exists
  if (pkg) {
    return {
      type: 'npm',
      name: pkg.name || 'unknown',
      version: pkg.version || '0.0.0',
      path: cwd,
      npm: {
        private: pkg.private || false,
        registry: pkg.publishConfig?.registry,
      },
    }
  }

  return {
    type: 'unknown',
    name: 'unknown',
    version: '0.0.0',
    path: cwd,
  }
}

/** Auto-detect environment capabilities */
export async function detectEnv(cwd: string): Promise<DetectedEnv> {
  const [hasBuildScript, hasTestScript, hasGhCli, hasEasCli] = await Promise.all([
    detectScript(cwd, 'build'),
    detectScript(cwd, 'test'),
    commandExists('gh'),
    commandExists('eas'),
  ])

  return { hasBuildScript, hasTestScript, hasGhCli, hasEasCli }
}

async function detectScript(cwd: string, name: string): Promise<boolean> {
  try {
    const pkg = await Bun.file(join(cwd, 'package.json')).json()
    return !!pkg.scripts?.[name]
  } catch {
    return false
  }
}

async function commandExists(cmd: string): Promise<boolean> {
  try {
    await $`which ${cmd}`.quiet()
    return true
  } catch {
    return false
  }
}

async function detectXcodeSchemes(projectPath: string): Promise<string[]> {
  try {
    const output = await $`xcodebuild -list -project ${projectPath} 2>/dev/null`.text()
    const schemesMatch = output.match(/Schemes:\n([\s\S]*?)(?:\n\n|$)/)
    if (schemesMatch) {
      return schemesMatch[1]
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean)
    }
    return []
  } catch {
    return []
  }
}

const TYPE_LABELS: Record<string, string> = {
  npm: 'npm package',
  expo: 'Expo app',
  tauri: 'Tauri app',
  macos: 'macOS app',
  unknown: 'Unknown project',
}

export function getProjectTypeLabel(type: string): string {
  return TYPE_LABELS[type] || type
}
