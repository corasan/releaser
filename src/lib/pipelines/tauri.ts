import { $ } from 'bun'
import { existsSync } from 'fs'
import { join } from 'path'
import {
  commitRelease,
  createGitHubRelease,
  getCurrentBranch,
  pushWithTags,
} from '../git.js'
import type { PipelineStep, ReleaseContext } from '../types.js'

export function getTauriSteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []

  if (ctx.config.hooks?.beforeRelease) {
    steps.push({
      id: 'pre-hook',
      label: 'Run pre-release hook',
      execute: async ctx => {
        await $`sh -c ${ctx.config.hooks!.beforeRelease!}`.cwd(ctx.project.path)
      },
    })
  }

  steps.push({
    id: 'bump-pkg',
    label: 'Bump version in package.json',
    execute: async ctx => {
      const pkgPath = join(ctx.project.path, 'package.json')
      const pkg = await Bun.file(pkgPath).json()
      pkg.version = ctx.newVersion
      await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    },
  })

  steps.push({
    id: 'bump-tauri',
    label: 'Bump version in Tauri config',
    execute: async ctx => {
      const configPath = ctx.project.tauri?.configPath
      if (!configPath || !existsSync(configPath)) return

      if (configPath.endsWith('.json')) {
        const config = await Bun.file(configPath).json()
        // Tauri v1 uses package.version, Tauri v2 uses version at root
        if (config.package) {
          config.package.version = ctx.newVersion
        } else {
          config.version = ctx.newVersion
        }
        await Bun.write(configPath, JSON.stringify(config, null, 2) + '\n')
      }

      // Also update Cargo.toml version if it exists
      const cargoPath = join(ctx.project.path, 'src-tauri', 'Cargo.toml')
      if (existsSync(cargoPath)) {
        let cargo = await Bun.file(cargoPath).text()
        cargo = cargo.replace(
          /^version\s*=\s*"[0-9]+\.[0-9]+\.[0-9]+"/m,
          `version = "${ctx.newVersion}"`,
        )
        await Bun.write(cargoPath, cargo)
      }
    },
  })

  steps.push({
    id: 'changelog',
    label: 'Update CHANGELOG.md',
    execute: async ctx => {
      if (!ctx.changelog) return
      const changelogPath = join(ctx.project.path, 'CHANGELOG.md')
      const date = new Date().toISOString().split('T')[0]
      const header = `## ${ctx.newVersion} (${date})\n\n`
      const entry = header + ctx.changelog + '\n\n'

      if (existsSync(changelogPath)) {
        const existing = await Bun.file(changelogPath).text()
        await Bun.write(changelogPath, entry + existing)
      } else {
        await Bun.write(changelogPath, `# Changelog\n\n${entry}`)
      }
    },
    skip: ctx => !ctx.changelog,
  })

  steps.push({
    id: 'commit-tag',
    label: 'Commit and create tag',
    execute: async ctx => {
      const files = ['package.json']
      const tauriConf = ctx.project.tauri?.configPath
      if (tauriConf && existsSync(tauriConf)) {
        files.push(tauriConf)
      }
      const cargoPath = join(ctx.project.path, 'src-tauri', 'Cargo.toml')
      if (existsSync(cargoPath)) files.push('src-tauri/Cargo.toml')
      const changelogPath = join(ctx.project.path, 'CHANGELOG.md')
      if (existsSync(changelogPath)) files.push('CHANGELOG.md')

      await commitRelease(files, `chore: release ${ctx.tag}`, ctx.tag)
    },
  })

  steps.push({
    id: 'push',
    label: 'Push to origin',
    execute: async () => {
      const branch = await getCurrentBranch()
      await pushWithTags(branch)
    },
  })

  if (ctx.config.tauri?.build) {
    steps.push({
      id: 'tauri-build',
      label: 'Build Tauri app',
      execute: async ctx => {
        await $`bunx tauri build`.cwd(ctx.project.path)
      },
    })
  }

  if (ctx.config.github?.release !== false) {
    steps.push({
      id: 'github-release',
      label: 'Create GitHub release',
      execute: async ctx => {
        await createGitHubRelease(
          ctx.tag,
          ctx.config.github?.generateNotes
            ? undefined
            : ctx.changelog || undefined,
        )
      },
    })
  }

  if (ctx.config.hooks?.afterRelease) {
    steps.push({
      id: 'post-hook',
      label: 'Run post-release hook',
      execute: async ctx => {
        await $`sh -c ${ctx.config.hooks!.afterRelease!}`.cwd(ctx.project.path)
      },
    })
  }

  return steps
}
