import { join } from 'node:path'
import type { ParsedProjectConfig, ProjectInfo, UIOption } from './types.js'

/**
 * Reads project config files and produces:
 * 1. Dynamic UI options (driven by what the configs contain)
 * 2. Structured data for pipelines to consume
 *
 * This is the "server-driven UI" layer — the project configs ARE the UI configs.
 */
export async function readProjectConfig(
  project: ProjectInfo,
): Promise<ParsedProjectConfig> {
  switch (project.type) {
    case 'expo':
      return readExpoConfig(project)
    case 'tauri':
      return readTauriConfig(project)
    case 'macos':
      return readMacosConfig(project)
    case 'npm':
      return readNpmConfig(project)
    default:
      return { options: [], data: {} }
  }
}

// ─── Expo ────────────────────────────────────────────────────────

async function readExpoConfig(
  project: ProjectInfo,
): Promise<ParsedProjectConfig> {
  const options: UIOption[] = []
  // biome-ignore lint/suspicious/noExplicitAny: dynamic config data from JSON files
  const data: Record<string, any> = {}

  // Parse app config for platform info
  const appConfig = project.expo?.appConfig || 'app.json'
  const appConfigPath = join(project.path, appConfig)

  if ((await Bun.file(appConfigPath).exists()) && appConfig === 'app.json') {
    try {
      const json = await Bun.file(appConfigPath).json()
      const expo = json.expo || json
      data.appName = expo.name
      data.hasIos = !!expo.ios
      data.hasAndroid = !!expo.android
      data.iosBundleId = expo.ios?.bundleIdentifier
      data.androidPackage = expo.android?.package
      data.currentBuildNumber = expo.ios?.buildNumber
      data.currentVersionCode = expo.android?.versionCode
    } catch {
      // Failed to parse, continue with defaults
    }
  } else if (await Bun.file(appConfigPath).exists()) {
    // For .ts/.js configs, try to extract info via regex
    try {
      const content = await Bun.file(appConfigPath).text()
      data.hasIos = /ios\s*[:=]\s*\{/.test(content)
      data.hasAndroid = /android\s*[:=]\s*\{/.test(content)
      data.iosBundleId = content.match(
        /bundleIdentifier\s*[:=]\s*['"]([^'"]+)['"]/,
      )?.[1]
      data.androidPackage = content.match(
        /package\s*[:=]\s*['"]([^'"]+)['"]/,
      )?.[1]
    } catch {
      data.hasIos = true
      data.hasAndroid = true
    }
  }

  // Parse eas.json — this is the main source of dynamic options
  const easPath = join(project.path, 'eas.json')

  if (await Bun.file(easPath).exists()) {
    try {
      const eas = await Bun.file(easPath).json()
      data.eas = eas

      // ── Build profiles → select option ──
      const buildProfiles = eas.build ? Object.keys(eas.build) : []
      data.buildProfiles = buildProfiles

      // ── Extract update channels from build profiles ──
      const updateChannels: string[] = []
      for (const name of buildProfiles) {
        const ch = eas.build[name]?.channel
        if (ch && !updateChannels.includes(ch)) updateChannels.push(ch)
      }
      data.updateChannels = updateChannels
      if (updateChannels.length === 1) data.defaultChannel = updateChannels[0]

      // ── Release type: full build vs OTA update ──
      options.push({
        id: 'releaseType',
        label: 'Release type',
        type: 'select',
        items: [
          {
            label: 'Full release',
            value: 'full',
            hint: 'EAS Build + optional store submit',
          },
          {
            label: 'OTA update',
            value: 'ota',
            hint: 'EAS Update (JS-only, no native rebuild)',
          },
        ],
      })

      if (buildProfiles.length > 1) {
        options.push({
          id: 'profile',
          label: 'Build profile',
          type: 'select',
          items: buildProfiles.map(name => {
            const config = eas.build[name]
            const hints: string[] = []
            if (config.developmentClient) hints.push('dev client')
            if (config.distribution === 'internal') hints.push('internal')
            if (
              config.distribution === 'store' ||
              (!config.distribution && name === 'production')
            )
              hints.push('store')
            if (config.channel) hints.push(`channel: ${config.channel}`)
            if (config.autoSubmit) hints.push('auto-submit')

            return {
              label: name,
              value: name,
              hint: hints.length ? hints.join(', ') : undefined,
            }
          }),
          when: answers => answers.releaseType !== 'ota',
        })
      } else if (buildProfiles.length === 1) {
        data.defaultProfile = buildProfiles[0]
      }

      // ── Update channel select (OTA only) ──
      if (updateChannels.length > 1) {
        options.push({
          id: 'channel',
          label: 'Update channel',
          type: 'select',
          items: updateChannels.map(ch => ({ label: ch, value: ch })),
          when: answers => answers.releaseType === 'ota',
        })
      }

      // ── Submit config → auto-detect what can be submitted ──
      const submitProfiles = eas.submit ? Object.keys(eas.submit) : []
      data.submitProfiles = submitProfiles
      data.hasSubmitConfig = submitProfiles.length > 0

      if (submitProfiles.length > 0) {
        // Check which platforms have submit configured
        const submitPlatforms: string[] = []
        for (const profile of submitProfiles) {
          const submitConfig = eas.submit[profile]
          if (submitConfig.ios) submitPlatforms.push('ios')
          if (submitConfig.android) submitPlatforms.push('android')
        }
        data.submitPlatforms = [...new Set(submitPlatforms)]
      }
    } catch {
      // Failed to parse eas.json
    }
  }

  // ── Platform selection ──
  // Only show if both platforms are configured
  if (data.hasIos !== false && data.hasAndroid !== false) {
    const platformItems = [
      { label: 'All (iOS + Android)', value: 'all', hint: undefined },
      ...(data.hasIos !== false
        ? [{ label: 'iOS only', value: 'ios', hint: data.iosBundleId }]
        : []),
      ...(data.hasAndroid !== false
        ? [
            {
              label: 'Android only',
              value: 'android',
              hint: data.androidPackage,
            },
          ]
        : []),
    ]

    if (platformItems.length > 1) {
      options.push({
        id: 'platform',
        label: 'Platform',
        type: 'select',
        items: platformItems,
        when: answers => answers.releaseType !== 'ota',
      })
    }
  } else if (data.hasIos) {
    data.defaultPlatform = 'ios'
  } else if (data.hasAndroid) {
    data.defaultPlatform = 'android'
  }

  // ── Submit to stores? ──
  if (data.hasSubmitConfig) {
    const platformLabel =
      data.submitPlatforms?.length === 2
        ? 'App Store + Google Play'
        : data.submitPlatforms?.includes('ios')
          ? 'App Store'
          : 'Google Play'

    options.push({
      id: 'submit',
      label: `Submit to ${platformLabel}`,
      type: 'confirm',
      items: [
        { label: `Yes, submit to ${platformLabel}`, value: 'yes' },
        { label: 'No, just build', value: 'no' },
      ],
      // Only show submit if selected profile has submit config and it's a full release
      when: answers => {
        if (answers.releaseType === 'ota') return false
        if (!data.eas?.submit) return false
        const profile = answers.profile || data.defaultProfile || 'production'
        return !!data.eas.submit[profile]
      },
    })
  }

  return { options, data }
}

// ─── Tauri ───────────────────────────────────────────────────────

async function readTauriConfig(
  project: ProjectInfo,
): Promise<ParsedProjectConfig> {
  const options: UIOption[] = []
  // biome-ignore lint/suspicious/noExplicitAny: dynamic config data from JSON files
  const data: Record<string, any> = {}

  const configPath = project.tauri?.configPath
  if (
    configPath &&
    (await Bun.file(configPath).exists()) &&
    configPath.endsWith('.json')
  ) {
    try {
      const config = await Bun.file(configPath).json()
      data.tauriConfig = config
      data.appName = config.package?.productName || config.productName
      data.version = config.package?.version || config.version

      // Extract build targets
      const bundle = config.tauri?.bundle || config.bundle
      if (bundle?.targets) {
        data.targets = Array.isArray(bundle.targets)
          ? bundle.targets
          : [bundle.targets]
      }
    } catch {
      // Failed to parse
    }
  }

  // Read Cargo.toml for workspace/package info
  const cargoPath = join(project.path, 'src-tauri', 'Cargo.toml')
  if (await Bun.file(cargoPath).exists()) {
    try {
      const cargo = await Bun.file(cargoPath).text()
      data.cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1]
      data.cargoName = cargo.match(/^name\s*=\s*"([^"]+)"/m)?.[1]
    } catch {
      // Failed to parse
    }
  }

  // Build option
  options.push({
    id: 'build',
    label: 'Build locally',
    type: 'confirm',
    items: [
      { label: 'No, just tag and push (CI builds)', value: 'no' },
      {
        label: 'Yes, build locally',
        value: 'yes',
        hint: data.targets?.join(', '),
      },
    ],
  })

  return { options, data }
}

// ─── macOS ───────────────────────────────────────────────────────

async function readMacosConfig(
  project: ProjectInfo,
): Promise<ParsedProjectConfig> {
  const options: UIOption[] = []
  // biome-ignore lint/suspicious/noExplicitAny: dynamic config data from JSON files
  const data: Record<string, any> = {}

  // Scheme selection (schemes already detected during project detection)
  const schemes = project.macos?.schemes || []
  data.schemes = schemes

  if (schemes.length > 1) {
    options.push({
      id: 'scheme',
      label: 'Xcode scheme',
      type: 'select',
      items: schemes.map(s => ({ label: s, value: s })),
    })
  } else if (schemes.length === 1) {
    data.defaultScheme = schemes[0]
  }

  // Build option
  options.push({
    id: 'build',
    label: 'Build with Xcode',
    type: 'confirm',
    items: [
      { label: 'Yes, build and archive', value: 'yes' },
      { label: 'No, just tag and push', value: 'no' },
    ],
  })

  // Notarize — only if building
  options.push({
    id: 'notarize',
    label: 'Notarize',
    type: 'confirm',
    items: [
      { label: 'No', value: 'no' },
      { label: 'Yes, notarize the app', value: 'yes' },
    ],
    when: answers => answers.build === 'yes',
  })

  return { options, data }
}

// ─── npm ─────────────────────────────────────────────────────────

async function readNpmConfig(
  project: ProjectInfo,
): Promise<ParsedProjectConfig> {
  // biome-ignore lint/suspicious/noExplicitAny: dynamic config data from JSON files
  const data: Record<string, any> = {}

  try {
    const pkg = await Bun.file(join(project.path, 'package.json')).json()
    data.access = pkg.publishConfig?.access
    data.registry = pkg.publishConfig?.registry
    data.files = pkg.files
    data.main = pkg.main || pkg.module || pkg.exports
  } catch {
    // Failed to parse
  }

  // npm packages are fully auto-detected — no interactive options needed
  return { options: [], data }
}
