import { join } from 'node:path'
import { $ } from 'bun'
import { createGitHubRelease, getCurrentBranch, pushWithTags } from '../git.js'
import type { PipelineStep, ReleaseContext } from '../types.js'

async function findInfoPlist(projectPath: string): Promise<string | null> {
  try {
    const glob = new Bun.Glob('**/Info.plist')
    for await (const entry of glob.scan({ cwd: projectPath })) {
      if (!entry.includes('build') && !entry.includes('Build')) {
        return join(projectPath, entry)
      }
    }
    return null
  } catch {
    return null
  }
}

export function getMacosSteps(ctx: ReleaseContext): PipelineStep[] {
  const steps: PipelineStep[] = []
  const { data } = ctx.projectConfig

  const scheme = ctx.answers.scheme || data.defaultScheme
  const shouldBuild = ctx.answers.build === 'yes'
  const shouldNotarize = ctx.answers.notarize === 'yes'

  steps.push({
    id: 'bump-version',
    label: 'Bump version in Info.plist',
    execute: async ctx => {
      const infoPlist = await findInfoPlist(ctx.project.path)
      if (!infoPlist) {
        throw new Error('Could not find Info.plist in project')
      }

      await $`/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${ctx.newVersion}" ${infoPlist}`
      const buildNum =
        await $`/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" ${infoPlist}`.text()
      const newBuild = Number.parseInt(buildNum.trim() || '0', 10) + 1
      await $`/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${newBuild}" ${infoPlist}`
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
      await $`git add -u`.cwd(ctx.project.path)
      if (await Bun.file(join(ctx.project.path, 'CHANGELOG.md')).exists()) {
        await $`git add CHANGELOG.md`.cwd(ctx.project.path)
      }
      await $`git commit -m ${`chore: release ${ctx.tag}`}`.cwd(
        ctx.project.path,
      )
      await $`git tag ${ctx.tag}`.cwd(ctx.project.path)
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

  if (shouldBuild && scheme) {
    steps.push({
      id: 'xcode-build',
      label: `Build with Xcode (${scheme})`,
      execute: async ctx => {
        const s = ctx.answers.scheme || ctx.projectConfig.data.defaultScheme
        await $`xcodebuild -scheme ${s} -configuration Release clean build`.cwd(
          ctx.project.path,
        )
      },
    })

    if (shouldNotarize) {
      steps.push({
        id: 'notarize',
        label: 'Notarize app',
        execute: async ctx => {
          const s = ctx.answers.scheme || ctx.projectConfig.data.defaultScheme
          const archivePath = join(
            ctx.project.path,
            'build',
            `${ctx.project.name}.xcarchive`,
          )
          await $`xcodebuild -scheme ${s} -configuration Release -archivePath ${archivePath} archive`.cwd(
            ctx.project.path,
          )
          await $`xcrun notarytool submit ${archivePath} --wait`
        },
      })
    }
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
