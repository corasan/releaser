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

export function getNpmSteps(ctx: ReleaseContext): PipelineStep[] {
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
      const changelogPath = join(ctx.project.path, 'CHANGELOG.md')
      if (existsSync(changelogPath)) files.push('CHANGELOG.md')

      // Also check for package-lock.json
      const lockPath = join(ctx.project.path, 'package-lock.json')
      if (existsSync(lockPath)) files.push('package-lock.json')

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

  if (ctx.config.npm?.publish !== false && !ctx.project.npm?.private) {
    steps.push({
      id: 'npm-publish',
      label: 'Publish to npm',
      execute: async ctx => {
        const args = []
        if (ctx.config.npm?.access) args.push('--access', ctx.config.npm.access)
        if (ctx.config.npm?.registry)
          args.push('--registry', ctx.config.npm.registry)
        await $`npm publish ${args}`.cwd(ctx.project.path)
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
