import { $ } from 'bun'
import { existsSync } from 'fs'
import { join } from 'path'
import { readdir } from 'fs/promises'
import type { PipelineStep, ReleaseContext } from '../types.js'
import { commitRelease, createGitHubRelease, pushWithTags, getCurrentBranch } from '../git.js'

async function findInfoPlist(projectPath: string): Promise<string | null> {
  // Common locations for Info.plist
  const candidates = [
    'Info.plist',
    '*/Info.plist',
  ]

  try {
    const entries = await readdir(projectPath, { recursive: true })
    const infoPlist = entries.find(
      (e) => typeof e === 'string' && e.endsWith('Info.plist') && !e.includes('build') && !e.includes('Build'),
    )
    return infoPlist ? join(projectPath, infoPlist) : null
  } catch {
    return null
  }
}

export function getMacosSteps(ctx: ReleaseContext): PipelineStep[] {
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

  steps.push({
    id: 'bump-version',
    label: 'Bump version in Info.plist',
    execute: async (ctx) => {
      const infoPlist = await findInfoPlist(ctx.project.path)
      if (!infoPlist) {
        throw new Error('Could not find Info.plist. Set the path in releaser.config.ts')
      }

      // Use PlistBuddy to update version
      await $`/usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString ${ctx.newVersion}" ${infoPlist}`
      // Increment build number
      const buildNum =
        await $`/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" ${infoPlist}`.text()
      const newBuild = parseInt(buildNum.trim() || '0') + 1
      await $`/usr/libexec/PlistBuddy -c "Set :CFBundleVersion ${newBuild}" ${infoPlist}`
    },
  })

  // Also bump package.json if it exists
  steps.push({
    id: 'bump-pkg',
    label: 'Bump version in package.json',
    execute: async (ctx) => {
      const pkgPath = join(ctx.project.path, 'package.json')
      if (!existsSync(pkgPath)) return
      const pkg = await Bun.file(pkgPath).json()
      pkg.version = ctx.newVersion
      await Bun.write(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
    },
    skip: (ctx) => !existsSync(join(ctx.project.path, 'package.json')),
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
      // Stage all tracked modified files
      await $`git add -u`.cwd(ctx.project.path)
      const changelogPath = join(ctx.project.path, 'CHANGELOG.md')
      if (existsSync(changelogPath)) {
        await $`git add CHANGELOG.md`.cwd(ctx.project.path)
      }
      await $`git commit -m ${'chore: release ' + ctx.tag}`.cwd(ctx.project.path)
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

  const scheme = ctx.config.macos?.scheme || ctx.project.macos?.scheme
  if (scheme) {
    steps.push({
      id: 'xcode-build',
      label: 'Build with Xcode',
      execute: async (ctx) => {
        await $`xcodebuild -scheme ${scheme} -configuration Release clean build`.cwd(
          ctx.project.path,
        )
      },
    })

    if (ctx.config.macos?.notarize) {
      steps.push({
        id: 'notarize',
        label: 'Notarize app',
        execute: async (ctx) => {
          const archivePath = join(ctx.project.path, 'build', `${ctx.project.name}.xcarchive`)
          await $`xcodebuild -scheme ${scheme} -configuration Release -archivePath ${archivePath} archive`.cwd(
            ctx.project.path,
          )
          // Notarization would need proper signing identity setup
          if (ctx.config.macos?.identity) {
            await $`xcrun notarytool submit ${archivePath} --apple-id ${ctx.config.macos.identity} --wait`
          }
        },
      })
    }
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
