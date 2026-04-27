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

export function getExpoSteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []
  const { data } = ctx.projectConfig

  const isOTA = ctx.answers.releaseType === 'ota'
  const profile = ctx.answers.profile || data.defaultProfile || 'production'
  const platform = ctx.answers.platform || data.defaultPlatform || 'all'
  const channel = ctx.answers.channel || data.defaultChannel || 'production'
  const shouldSubmit = ctx.answers.submit === 'yes'

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

  if (!ctx.project.expo?.easConfigured) {
    steps.push({
      id: 'eas-setup',
      label: 'Configure EAS Build',
      execute: async ctx => {
        await $`bunx eas-cli build:configure`.cwd(ctx.project.path).quiet()
      },
    })
  }

  steps.push(createHookStep('preBump'))

  steps.push({
    id: 'bump-version',
    label: 'Bump version in package.json',
    execute: async ctx => {
      const pkgPath = join(ctx.project.path, 'package.json')
      const pkg = await Bun.file(pkgPath).json()
      pkg.version = ctx.newVersion
      await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
    },
  })

  steps.push({
    id: 'bump-app-config',
    label: 'Bump version + build number in app config',
    // OTA updates don't create a new native binary — skip build number increment
    skip: ctx => ctx.answers.releaseType === 'ota',
    execute: async ctx => {
      const appConfig = ctx.project.expo?.appConfig || 'app.config.ts'
      const configPath = join(ctx.project.path, appConfig)
      if (!(await Bun.file(configPath).exists())) return

      if (appConfig === 'app.json') {
        const json = await Bun.file(configPath).json()
        const expo = json.expo || json

        expo.version = ctx.newVersion

        if (expo.ios) {
          const currentBuild = Number.parseInt(expo.ios.buildNumber || '0', 10)
          expo.ios.buildNumber = String(currentBuild + 1)
        }
        if (expo.android) {
          expo.android.versionCode = (expo.android.versionCode || 0) + 1
        }

        await Bun.write(configPath, `${JSON.stringify(json, null, 2)}\n`)
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

  steps.push(createHookStep('postBump'))

  steps.push({
    id: 'commit-tag',
    label: 'Commit and create tag',
    execute: async ctx => {
      const files = ['package.json']
      const appConfig = ctx.project.expo?.appConfig
      if (
        appConfig &&
        (await Bun.file(join(ctx.project.path, appConfig)).exists())
      )
        files.push(appConfig)
      if (
        !ctx.project.expo?.easConfigured &&
        (await Bun.file(join(ctx.project.path, 'eas.json')).exists())
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

  if (isOTA) {
    steps.push({
      id: 'eas-update',
      label: `EAS Update (channel: ${channel})`,
      execute: async ctx => {
        const ch =
          ctx.answers.channel ||
          ctx.projectConfig.data.defaultChannel ||
          'production'
        const msg = `Release ${ctx.tag}`
        await $`bunx eas-cli update --channel ${ch} --message ${msg} --non-interactive`.cwd(
          ctx.project.path,
        ).quiet()
      },
    })
  } else {
    const platformLabel = platform === 'all' ? 'iOS + Android' : platform
    steps.push({
      id: 'eas-build',
      label: `EAS build (${profile}, ${platformLabel})`,
      execute: async ctx => {
        const p =
          ctx.answers.platform ||
          ctx.projectConfig.data.defaultPlatform ||
          'all'
        const prof =
          ctx.answers.profile ||
          ctx.projectConfig.data.defaultProfile ||
          'production'
        await $`bunx eas-cli build --platform ${p} --profile ${prof} --non-interactive`.cwd(
          ctx.project.path,
        ).quiet()
      },
    })

    if (shouldSubmit) {
      steps.push({
        id: 'eas-submit',
        label: `Submit to stores (${platformLabel})`,
        execute: async ctx => {
          const p =
            ctx.answers.platform ||
            ctx.projectConfig.data.defaultPlatform ||
            'all'
          await $`bunx eas-cli submit --platform ${p} --non-interactive`.cwd(
            ctx.project.path,
          ).quiet()
        },
      })
    }
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
