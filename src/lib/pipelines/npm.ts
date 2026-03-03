import { join } from 'node:path'
import { $ } from 'bun'
import {
  commitRelease,
  createGitHubRelease,
  getCurrentBranch,
  pushWithTags,
} from '../git.js'
import { runHook } from '../hooks.js'
import type { PipelineStep, ReleaseContext } from '../types.js'

export function getNpmSteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []

  if (ctx.env.hasBuildScript) {
    steps.push({
      id: 'build',
      label: 'Run build',
      execute: async ctx => {
        await $`bun run build`.cwd(ctx.project.path)
      },
    })
  }

  if (ctx.env.hasTestScript) {
    steps.push({
      id: 'test',
      label: 'Run tests',
      execute: async ctx => {
        await $`bun run test`.cwd(ctx.project.path)
      },
    })
  }

  steps.push({
    id: 'hook-preBump',
    label: 'Run preBump hook',
    execute: async ctx => {
      await runHook('preBump', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.preBump,
  })

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
    id: 'hook-postBump',
    label: 'Run postBump hook',
    execute: async ctx => {
      await runHook('postBump', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.postBump,
  })

  steps.push({
    id: 'changelog',
    label: 'Update CHANGELOG.md',
    execute: async ctx => {
      if (!ctx.changelog) return
      const changelogPath = join(ctx.project.path, 'CHANGELOG.md')
      const date = new Date().toISOString().split('T')[0]
      const entry = `## ${ctx.newVersion} (${date})\n\n${ctx.changelog}\n\n`

      if (await Bun.file(changelogPath).exists()) {
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
      if (await Bun.file(join(ctx.project.path, 'CHANGELOG.md')).exists())
        files.push('CHANGELOG.md')
      if (await Bun.file(join(ctx.project.path, 'package-lock.json')).exists())
        files.push('package-lock.json')
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

  steps.push({
    id: 'hook-prePublish',
    label: 'Run prePublish hook',
    execute: async ctx => {
      await runHook('prePublish', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.prePublish,
  })

  if (!ctx.project.npm?.private) {
    steps.push({
      id: 'npm-publish',
      label: 'Publish to npm',
      execute: async ctx => {
        await $`npm publish`.cwd(ctx.project.path)
      },
    })
  }

  steps.push({
    id: 'hook-postPublish',
    label: 'Run postPublish hook',
    execute: async ctx => {
      await runHook('postPublish', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.postPublish,
  })

  steps.push({
    id: 'hook-preRelease',
    label: 'Run preRelease hook',
    execute: async ctx => {
      await runHook('preRelease', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.preRelease,
  })

  if (ctx.env.hasGhCli) {
    steps.push({
      id: 'github-release',
      label: 'Create GitHub release',
      execute: async ctx => {
        await createGitHubRelease(ctx.tag, ctx.changelog)
      },
    })
  }

  steps.push({
    id: 'hook-postRelease',
    label: 'Run postRelease hook',
    execute: async ctx => {
      await runHook('postRelease', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.postRelease,
  })

  return steps
}
