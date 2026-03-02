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

export function getExpoSteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []
  const { data } = ctx.projectConfig

  const profile = ctx.answers.profile || data.defaultProfile || 'production'
  const platform = ctx.answers.platform || data.defaultPlatform || 'all'
  const shouldSubmit = ctx.answers.submit === 'yes'

  if (ctx.env.hasTestScript) {
    steps.push({
      id: 'test',
      label: 'Run tests',
      execute: async ctx => {
        await $`bun run test`.cwd(ctx.project.path)
      },
    })
  }

  if (!ctx.project.expo?.easConfigured) {
    steps.push({
      id: 'eas-setup',
      label: 'Configure EAS Build',
      execute: async ctx => {
        await $`bunx eas-cli build:configure`.cwd(ctx.project.path)
      },
    })
  }

  steps.push({
    id: 'bump-version',
    label: 'Bump version in package.json',
    execute: async ctx => {
      const pkgPath = join(ctx.project.path, 'package.json')
      const pkg = await Bun.file(pkgPath).json()
      pkg.version = ctx.newVersion
      await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    },
  })

  steps.push({
    id: 'bump-app-config',
    label: 'Bump version + build number in app config',
    execute: async ctx => {
      const appConfig = ctx.project.expo?.appConfig || 'app.config.ts'
      const configPath = join(ctx.project.path, appConfig)
      if (!existsSync(configPath)) return

      if (appConfig === 'app.json') {
        const json = await Bun.file(configPath).json()
        const expo = json.expo || json

        expo.version = ctx.newVersion

        if (expo.ios) {
          const currentBuild = parseInt(expo.ios.buildNumber || '0')
          expo.ios.buildNumber = String(currentBuild + 1)
        }
        if (expo.android) {
          expo.android.versionCode = (expo.android.versionCode || 0) + 1
        }

        await Bun.write(configPath, JSON.stringify(json, null, 2) + '\n')
      } else {
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
    execute: async ctx => {
      if (!ctx.changelog) return
      const changelogPath = join(ctx.project.path, 'CHANGELOG.md')
      const date = new Date().toISOString().split('T')[0]
      const entry = `## ${ctx.newVersion} (${date})\n\n${ctx.changelog}\n\n`

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
      const appConfig = ctx.project.expo?.appConfig
      if (appConfig && existsSync(join(ctx.project.path, appConfig))) files.push(appConfig)
      if (existsSync(join(ctx.project.path, 'CHANGELOG.md'))) files.push('CHANGELOG.md')
      if (
        !ctx.project.expo?.easConfigured &&
        existsSync(join(ctx.project.path, 'eas.json'))
      ) {
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

  const platformLabel = platform === 'all' ? 'iOS + Android' : platform
  steps.push({
    id: 'eas-build',
    label: `EAS build (${profile}, ${platformLabel})`,
    execute: async ctx => {
      const p = ctx.answers.platform || ctx.projectConfig.data.defaultPlatform || 'all'
      const prof = ctx.answers.profile || ctx.projectConfig.data.defaultProfile || 'production'
      await $`bunx eas-cli build --platform ${p} --profile ${prof} --non-interactive`.cwd(
        ctx.project.path,
      )
    },
  })

  if (shouldSubmit) {
    steps.push({
      id: 'eas-submit',
      label: `Submit to stores (${platformLabel})`,
      execute: async ctx => {
        const p = ctx.answers.platform || ctx.projectConfig.data.defaultPlatform || 'all'
        await $`bunx eas-cli submit --platform ${p} --non-interactive`.cwd(ctx.project.path)
      },
    })
  }

  if (ctx.env.hasGhCli) {
    steps.push({
      id: 'github-release',
      label: 'Create GitHub release',
      execute: async ctx => {
        await createGitHubRelease(ctx.tag, ctx.changelog)
      },
    })
  }

  return steps
}
