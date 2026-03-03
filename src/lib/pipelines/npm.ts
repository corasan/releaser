import { join } from 'node:path'
import { $ } from 'bun'
import {
  commitRelease,
  createGitHubRelease,
  getCurrentBranch,
  pushWithTags,
} from '../git.js'
import { runHook } from '../hooks.js'
import { bumpMonorepoVersions, bumpMonorepoVersionsIndependent, getPublishablePackages } from '../monorepo.js'
import type { PipelineStep, ReleaseContext } from '../types.js'

async function npmPublish(cwd: string, tag?: string) {
  const args = ['npm', 'publish']
  if (tag) args.push('--tag', tag)
  const proc = Bun.spawn(args, {
    cwd,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await proc.exited
  if (code !== 0) throw new Error(`npm publish exited with code ${code}`)
}

function addNpmPublishSteps(steps: PipelineStep[], ctx: ReleaseContext) {
  steps.push({
    id: 'hook-prePublish',
    label: 'Run prePublish hook',
    execute: async ctx => {
      await runHook('prePublish', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.prePublish,
  })

  if (ctx.packageBumps && ctx.releaserConfig?.packages) {
    const publishable = new Set(getPublishablePackages(ctx.releaserConfig.packages))
    for (const b of ctx.packageBumps) {
      if (publishable.has(b.relativePath)) {
        const tag = b.preRelease || ctx.preRelease
        steps.push({
          id: `npm-publish-${b.relativePath.replace(/\//g, '-')}`,
          label: tag
            ? `Publish ${b.name}@${b.newVersion} (tag: ${tag})`
            : `Publish ${b.name}@${b.newVersion}`,
          execute: async () => {
            await npmPublish(join(ctx.project.path, b.relativePath), tag)
          },
        })
      }
    }
  } else if (ctx.releaserConfig?.packages) {
    const publishable = getPublishablePackages(ctx.releaserConfig.packages)
    for (const pkgPath of publishable) {
      steps.push({
        id: `npm-publish-${pkgPath.replace(/\//g, '-')}`,
        label: ctx.preRelease
          ? `Publish ${pkgPath} (tag: ${ctx.preRelease})`
          : `Publish ${pkgPath}`,
        execute: async ctx => {
          await npmPublish(join(ctx.project.path, pkgPath), ctx.preRelease)
        },
      })
    }
  } else if (ctx.project.npm?.publish) {
    steps.push({
      id: 'npm-publish',
      label: ctx.preRelease
        ? `Publish to npm (tag: ${ctx.preRelease})`
        : 'Publish to npm',
      execute: async ctx => {
        await npmPublish(ctx.project.path, ctx.preRelease)
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
}

export function getPublishOnlySteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []
  addNpmPublishSteps(steps, ctx)
  return steps
}

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
    label: ctx.packageBumps
      ? 'Bump versions independently'
      : ctx.releaserConfig?.packages
        ? 'Bump version in all packages'
        : 'Bump version in package.json',
    execute: async ctx => {
      if (ctx.packageBumps) {
        const bumps: Record<string, string> = {}
        for (const b of ctx.packageBumps) {
          bumps[b.relativePath] = b.newVersion
        }
        await bumpMonorepoVersionsIndependent(ctx.project.path, bumps)
      } else if (ctx.releaserConfig?.packages) {
        await bumpMonorepoVersions(ctx.project.path, ctx.releaserConfig.packages, ctx.newVersion)
      } else {
        const pkgPath = join(ctx.project.path, 'package.json')
        const pkg = await Bun.file(pkgPath).json()
        pkg.version = ctx.newVersion
        await Bun.write(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
      }
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
    skip: ctx => {
      if (!ctx.changelog) return true
      if (ctx.releaserConfig?.changelog === false) return true
      return false
    },
  })

  steps.push({
    id: 'commit-tag',
    label: 'Commit and create tag',
    execute: async ctx => {
      const files: string[] = []
      if (ctx.packageBumps) {
        for (const b of ctx.packageBumps) {
          files.push(join(b.relativePath, 'package.json'))
        }
      } else if (ctx.releaserConfig?.packages) {
        for (const [pkgPath, config] of Object.entries(ctx.releaserConfig.packages)) {
          if (config.bump) files.push(join(pkgPath, 'package.json'))
        }
      } else {
        files.push('package.json')
      }
      if (await Bun.file(join(ctx.project.path, 'CHANGELOG.md')).exists())
        files.push('CHANGELOG.md')
      if (await Bun.file(join(ctx.project.path, 'package-lock.json')).exists())
        files.push('package-lock.json')

      if (ctx.packageBumps) {
        const tags = ctx.packageBumps.map(b => `${b.name}@${b.newVersion}`)
        await commitRelease(files, `chore: release ${tags.join(', ')}`, tags)
      } else {
        await commitRelease(files, `chore: release ${ctx.tag}`, ctx.tag)
      }
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
    id: 'hook-preRelease',
    label: 'Run preRelease hook',
    execute: async ctx => {
      await runHook('preRelease', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.preRelease,
  })

  if (ctx.env.hasGhCli) {
    if (ctx.packageBumps) {
      for (const b of ctx.packageBumps) {
        const tag = `${b.name}@${b.newVersion}`
        steps.push({
          id: `github-release-${b.relativePath.replace(/\//g, '-')}`,
          label: `Create GitHub release for ${b.name}@${b.newVersion}`,
          execute: async ctx => {
            const notes = ctx.releaserConfig?.aiReleaseNotes
              ? (ctx.packageChangelogs?.[b.relativePath] ?? ctx.changelog)
              : undefined
            return await createGitHubRelease(tag, notes, !!ctx.preRelease)
          },
        })
      }
    } else {
      steps.push({
        id: 'github-release',
        label: 'Create GitHub release',
        execute: async ctx => {
          const notes = ctx.releaserConfig?.aiReleaseNotes ? ctx.changelog : undefined
          return await createGitHubRelease(ctx.tag, notes, !!ctx.preRelease)
        },
      })
    }
  }

  steps.push({
    id: 'hook-postRelease',
    label: 'Run postRelease hook',
    execute: async ctx => {
      await runHook('postRelease', ctx.releaserConfig, ctx.project.path)
    },
    skip: ctx => !ctx.releaserConfig?.hooks?.postRelease,
  })

  addNpmPublishSteps(steps, ctx)

  return steps
}
