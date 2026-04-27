import { join } from 'node:path'
import { $ } from 'bun'
import {
  commitRelease,
  createGitHubRelease,
  getCurrentBranch,
  pushWithTags,
} from '../git.js'
import { createHookStep } from '../hooks.js'
import type { PipelineStep, ReleaseContext } from '../types.js'

export function getTauriSteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []
  const shouldBuild = ctx.answers.build === 'yes'

  if (ctx.env.hasBuildScript) {
    steps.push({
      id: 'build-frontend',
      label: 'Build frontend',
      execute: async ctx => {
        await $`bun run build`.cwd(ctx.project.path).quiet()
      },
    })
  }

  if (ctx.env.hasTestScript) {
    steps.push({
      id: 'test',
      label: 'Run tests',
      execute: async ctx => {
        const proc = Bun.spawn(['bun', 'run', 'test'], {
          cwd: ctx.project.path,
          stdout: 'ignore',
          stderr: 'ignore',
        })
        const code = await proc.exited
        if (code !== 0) throw new Error('Tests failed')
      },
    })
  }

  steps.push(createHookStep('preBump'))

  steps.push({
    id: 'bump-tauri',
    label: 'Bump version in Tauri config',
    execute: async ctx => {
      const configPath = ctx.project.tauri?.configPath
      if (!configPath || !(await Bun.file(configPath).exists())) return

      if (configPath.endsWith('.json')) {
        const config = await Bun.file(configPath).json()
        if (config.package) {
          config.package.version = ctx.newVersion
        } else {
          config.version = ctx.newVersion
        }
        await Bun.write(configPath, `${JSON.stringify(config, null, 2)}\n`)
      }

      const cargoPath = join(ctx.project.path, 'src-tauri', 'Cargo.toml')
      if (await Bun.file(cargoPath).exists()) {
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
    id: 'bump-pkg',
    label: 'Bump version in package.json',
    execute: async ctx => {
      const pkgPath = join(ctx.project.path, 'package.json')
      if (!(await Bun.file(pkgPath).exists())) return
      const pkg = await Bun.file(pkgPath).json()
      pkg.version = ctx.newVersion
      await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    },
  })

  steps.push(createHookStep('postBump'))

  steps.push({
    id: 'commit-tag',
    label: 'Commit and create tag',
    execute: async ctx => {
      const files = ['package.json']
      const tauriConf = ctx.project.tauri?.configPath
      if (tauriConf && (await Bun.file(tauriConf).exists()))
        files.push(tauriConf)
      const cargoPath = join(ctx.project.path, 'src-tauri', 'Cargo.toml')
      if (await Bun.file(cargoPath).exists()) files.push('src-tauri/Cargo.toml')
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

  if (shouldBuild) {
    steps.push({
      id: 'tauri-build',
      label: 'Build Tauri app',
      execute: async ctx => {
        await $`bunx tauri build`.cwd(ctx.project.path).quiet()
      },
    })
  }

  steps.push(createHookStep('preRelease'))

  if (ctx.env.hasGhCli) {
    steps.push({
      id: 'github-release',
      label: 'Create GitHub release',
      execute: async ctx => {
        return await createGitHubRelease(ctx.tag)
      },
    })
  }

  steps.push(createHookStep('postRelease'))

  return steps
}
