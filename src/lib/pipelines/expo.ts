import { $ } from 'bun'
import { existsSync } from 'fs'
import { join } from 'path'
import type { PipelineStep, ReleaseContext } from '../types.js'
import { commitRelease, createGitHubRelease, pushWithTags, getCurrentBranch } from '../git.js'

export function getExpoSteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []

  if (ctx.config.hooks?.beforeRelease) {
    steps.push({
      id: 'pre-hook',
      label: 'Run pre-release hook',
      execute: async (ctx) => {
        await $`sh -c ${ctx.config.hooks!.beforeRelease!}`.cwd(ctx.project.path)
      },
    })
  }

  // Set up EAS if not configured
  if (!ctx.project.expo?.easConfigured) {
    steps.push({
      id: 'eas-setup',
      label: 'Configure EAS Build',
      execute: async (ctx) => {
        await $`bunx eas-cli build:configure`.cwd(ctx.project.path)
      },
    })
  }

  steps.push({
    id: 'bump-version',
    label: 'Bump version in package.json',
    execute: async (ctx) => {
      const pkgPath = join(ctx.project.path, 'package.json')
      const pkg = await Bun.file(pkgPath).json()
      pkg.version = ctx.newVersion
      await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    },
  })

  steps.push({
    id: 'bump-app-config',
    label: 'Bump version in app config',
    execute: async (ctx) => {
      const appConfig = ctx.project.expo?.appConfig || 'app.config.ts'
      const configPath = join(ctx.project.path, appConfig)

      if (!existsSync(configPath)) return

      if (appConfig === 'app.json') {
        const json = await Bun.file(configPath).json()
        if (json.expo) {
          json.expo.version = ctx.newVersion
          // Auto-increment build number
          const currentBuild = parseInt(json.expo.ios?.buildNumber || '0')
          if (json.expo.ios) json.expo.ios.buildNumber = String(currentBuild + 1)
          if (json.expo.android) {
            json.expo.android.versionCode = (json.expo.android.versionCode || 0) + 1
          }
        }
        await Bun.write(configPath, JSON.stringify(json, null, 2) + '\n')
      } else {
        // For app.config.ts/js, do regex replacement
        let content = await Bun.file(configPath).text()
        content = content.replace(
          /version:\s*['"][0-9]+\.[0-9]+\.[0-9]+['"]/,
          `version: '${ctx.newVersion}'`,
        )
        await Bun.write(configPath, content)
      }
    },
  })

  steps.push({
    id: 'changelog',
    label: 'Update CHANGELOG.md',
    execute: async (ctx) => {
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
    skip: (ctx) => !ctx.changelog,
  })

  steps.push({
    id: 'commit-tag',
    label: 'Commit and create tag',
    execute: async (ctx) => {
      const files = ['package.json']
      const appConfig = ctx.project.expo?.appConfig
      if (appConfig) files.push(appConfig)
      const changelogPath = join(ctx.project.path, 'CHANGELOG.md')
      if (existsSync(changelogPath)) files.push('CHANGELOG.md')
      if (!ctx.project.expo?.easConfigured && existsSync(join(ctx.project.path, 'eas.json'))) {
        files.push('eas.json')
      }

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

  // EAS Build
  const platform = ctx.config.expo?.buildPlatform || 'all'
  const profile = ctx.config.expo?.profile || 'production'

  steps.push({
    id: 'eas-build',
    label: `Trigger EAS build (${platform})`,
    execute: async (ctx) => {
      await $`bunx eas-cli build --platform ${platform} --profile ${profile} --non-interactive`.cwd(
        ctx.project.path,
      )
    },
  })

  if (ctx.config.expo?.submitToStore) {
    steps.push({
      id: 'eas-submit',
      label: 'Submit to app stores',
      execute: async (ctx) => {
        await $`bunx eas-cli submit --platform ${platform} --non-interactive`.cwd(ctx.project.path)
      },
    })
  }

  if (ctx.config.github?.release !== false) {
    steps.push({
      id: 'github-release',
      label: 'Create GitHub release',
      execute: async (ctx) => {
        await createGitHubRelease(
          ctx.tag,
          ctx.config.github?.generateNotes ? undefined : ctx.changelog || undefined,
        )
      },
    })
  }

  if (ctx.config.hooks?.afterRelease) {
    steps.push({
      id: 'post-hook',
      label: 'Run post-release hook',
      execute: async (ctx) => {
        await $`sh -c ${ctx.config.hooks!.afterRelease!}`.cwd(ctx.project.path)
      },
    })
  }

  return steps
}
