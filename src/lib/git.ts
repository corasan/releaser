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
  await $`git add ${files}`.quiet()
  await $`git commit -m ${message}`.quiet()
  const tagList = Array.isArray(tags) ? tags : [tags]
  for (const tag of tagList) {
    await $`git tag ${tag}`.quiet()
  }
}

export async function pushWithTags(branch: string): Promise<void> {
  await $`git push origin ${branch} --tags`.quiet()
}

export async function createGitHubRelease(
  tag: string,
  isPreRelease?: boolean,
): Promise<string> {
  const args = ['gh', 'release', 'create', tag, '--generate-notes']
  if (isPreRelease) args.push('--prerelease')
  const url = (await $`${args}`.text()).trim()
  return url
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
