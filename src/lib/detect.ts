import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { $ } from 'bun'
import type { DetectedEnv, ProjectInfo } from './types.js'

export async function detectProject(cwd: string): Promise<ProjectInfo> {
  const pkgPath = join(cwd, 'package.json')
  // biome-ignore lint/suspicious/noExplicitAny: dynamic JSON from package.json
  let pkg: Record<string, any> | null = null

  if (await Bun.file(pkgPath).exists()) {
    pkg = await Bun.file(pkgPath).json()
  }

  // Check for Expo (must come before generic npm check)
  if (pkg && (pkg.dependencies?.expo || pkg.devDependencies?.expo)) {
    const appConfigTs = join(cwd, 'app.config.ts')
    const appConfigJs = join(cwd, 'app.config.js')
    const appConfig = (await Bun.file(appConfigTs).exists())
      ? 'app.config.ts'
      : (await Bun.file(appConfigJs).exists())
        ? 'app.config.js'
        : 'app.json'

    return {
      type: 'expo',
      name: pkg.name || 'expo-app',
      version: pkg.version || '0.0.0',
      path: cwd,
      expo: {
        easConfigured: await Bun.file(join(cwd, 'eas.json')).exists(),
        appConfig,
      },
    }
  }

  // Check for Tauri
  const srcTauriDir = join(cwd, 'src-tauri')
  const tauriConf = join(srcTauriDir, 'tauri.conf.json')

  if (existsSync(srcTauriDir)) {
    const tauriVersion = (await Bun.file(
      join(srcTauriDir, 'Cargo.toml'),
    ).exists())
      ? 2
      : 1
    let tauriConfig: Record<string, string> | null = null
    try {
      tauriConfig = await Bun.file(tauriConf).json()
    } catch {
      // tauri.conf.json missing or invalid
    }
    return {
      type: 'tauri',
      name: tauriConfig?.productName || pkg?.name || 'tauri-app',
      version: tauriConfig?.version || pkg?.version || '0.0.0',
      path: cwd,
      tauri: {
        configPath: tauriConf,
        version: tauriVersion,
      },
    }
  }

  // Check for macOS app (Xcode project)
  try {
    const glob = new Bun.Glob('*.{xcodeproj,xcworkspace}')
    for await (const xcodeProject of glob.scan({ cwd, onlyFiles: false })) {
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
    // glob scan failed, continue
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
        publish: pkg.private === false || !!pkg.publishConfig,
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
  const [hasBuildScript, hasTestScript, hasGhCli, hasEasCli] =
    await Promise.all([
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
    const output =
      await $`xcodebuild -list -project ${projectPath} 2>/dev/null`.text()
    const schemesMatch = output.match(/Schemes:\n([\s\S]*?)(?:\n\n|$)/)
    if (schemesMatch) {
      return schemesMatch[1]
        .split('\n')
        .map(s => s.trim())
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
