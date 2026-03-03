import { $ } from 'bun'

export async function getLastTag(): Promise<string | null> {
  try {
    const tag = (
      await $`git describe --tags --abbrev=0 2>/dev/null`.text()
    ).trim()
    return tag || null
  } catch {
    return null
  }
}

async function getCommitsSince(
  lastTag: string | null,
  path?: string,
): Promise<string[]> {
  const pathArgs = path ? ['--', path] : []
  if (lastTag) {
    const log =
      await $`git log ${lastTag}..HEAD --oneline ${pathArgs}`.text()
    return log.trim().split('\n').filter(Boolean)
  }
  const log = await $`git log --oneline -50 ${pathArgs}`.text()
  return log.trim().split('\n').filter(Boolean)
}

export async function getCommitsSinceLastTag(): Promise<string[]> {
  const lastTag = await getLastTag()
  return getCommitsSince(lastTag)
}

export async function getCommitsSinceLastTagForPath(
  relativePath: string,
  lastTag?: string | null,
): Promise<string[]> {
  const tag = lastTag !== undefined ? lastTag : await getLastTag()
  return getCommitsSince(tag, relativePath)
}

export async function getCurrentBranch(): Promise<string> {
  return (await $`git branch --show-current`.text()).trim()
}

export async function hasUncommittedChanges(): Promise<boolean> {
  const status = await $`git status --porcelain`.text()
  return status.trim().length > 0
}

export async function commitRelease(
  files: string[],
  message: string,
  tags: string | string[],
): Promise<void> {
  await $`git add ${files}`
  await $`git commit -m ${message}`
  const tagList = Array.isArray(tags) ? tags : [tags]
  for (const tag of tagList) {
    await $`git tag ${tag}`
  }
}

export async function pushWithTags(branch: string): Promise<void> {
  await $`git push origin ${branch} --tags`
}

export async function createGitHubRelease(
  tag: string,
  notes?: string,
  isPreRelease?: boolean,
): Promise<string> {
  const releaseNotes = notes || (await generateReleaseNotes())
  const args = ['gh', 'release', 'create', tag]
  if (isPreRelease) args.push('--prerelease')
  if (releaseNotes) {
    args.push('--notes', releaseNotes)
  } else {
    args.push('--generate-notes')
  }
  const url = (await $`${args}`.text()).trim()
  return url
}

async function generateReleaseNotes(): Promise<string | null> {
  try {
    // Get the two most recent tags to find commits between them
    const tags = (await $`git tag --sort=-version:refname`.text())
      .trim().split('\n').filter(Boolean)
    if (tags.length < 2) {
      // First release — get all commits up to the tag
      const log = await $`git log ${tags[0]} --oneline`.text()
      const commits = log.trim().split('\n').filter(Boolean)
      if (commits.length === 0) return null
      // Exclude the release commit itself
      const lines = commits.slice(1).map(c => formatCommitLine(c))
      return lines.length > 0 ? `## What's Changed\n\n${lines.join('\n')}` : null
    }
    const [currentTag, previousTag] = tags
    const log = await $`git log ${previousTag}..${currentTag} --oneline`.text()
    const commits = log.trim().split('\n').filter(Boolean)
    if (commits.length === 0) return null
    // Exclude the release commit itself (first one, "chore: release vX.Y.Z")
    const meaningful = commits.filter(c => !c.match(/^[a-f0-9]+ chore: release /))
    if (meaningful.length === 0) return null
    const lines = meaningful.map(c => formatCommitLine(c))
    return `## What's Changed\n\n${lines.join('\n')}`
  } catch {
    return null
  }
}

/** Format a git oneline commit as a release note line with commit link.
 *  GitHub auto-links short SHAs and #N PR references in release notes. */
function formatCommitLine(oneline: string): string {
  const match = oneline.match(/^([a-f0-9]+) (.+)$/)
  if (!match) return `- ${oneline}`
  const [, sha, message] = match
  return `- ${message} (${sha})`
}

export async function isGitRepo(): Promise<boolean> {
  try {
    await $`git rev-parse --is-inside-work-tree`.quiet()
    return true
  } catch {
    return false
  }
}

export async function hasGhCli(): Promise<boolean> {
  try {
    await $`gh --version`.quiet()
    return true
  } catch {
    return false
  }
}
