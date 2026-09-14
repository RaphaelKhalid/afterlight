export const AFTERLIGHT_EMBED_VERSION = 1 as const
export const AUTOLABS_ORIGIN = 'https://autolabs-ebon.vercel.app'
export const MAX_EMBED_PATH_LENGTH = 256
export const MAX_DESIGN_TITLE_LENGTH = 300
export const MAX_SOURCE_URL_LENGTH = 2048

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._~-]{0,127}$/
const CANONICAL_ROUTE = /^\/(?:atlas|(?:questions|designer|lab|results)\/[A-Za-z0-9][A-Za-z0-9._~-]{0,127})$/

export type AfterlightNavigationMessage = {
  type: 'afterlight:navigation'
  version: typeof AFTERLIGHT_EMBED_VERSION
  path: string
}

export type AfterlightReadyMessage = {
  type: 'afterlight:ready'
  version: typeof AFTERLIGHT_EMBED_VERSION
}

export type AfterlightDesignMessage = {
  type: 'afterlight:design'
  version: typeof AFTERLIGHT_EMBED_VERSION
  question: { id: string; title: string; sourceUrl: string }
}

export type AutolabsNavigateMessage = {
  type: 'autolabs:navigate'
  version: typeof AFTERLIGHT_EMBED_VERSION
  path: string
}

export type AfterlightParentEvent = { origin: string; source: unknown; data: unknown }

export function isAutolabsEmbed(search = typeof window === 'undefined' ? '' : window.location.search): boolean {
  return new URLSearchParams(search).get('embed') === 'autolabs'
}

export function normalizeEmbedOrigins(configured: readonly string[] = []): string[] {
  const origins = configured
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .filter((value) => isExactOrigin(value))
  return [...new Set([AUTOLABS_ORIGIN, ...origins])]
}

function isExactOrigin(value: string): boolean {
  try {
    const parsed = new URL(value)
    const isProduction = value === AUTOLABS_ORIGIN
    const isLocalDevelopment = (parsed.protocol === 'http:' || parsed.protocol === 'https:') && /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname)
    return parsed.origin === value && (isProduction || isLocalDevelopment)
  } catch {
    return false
  }
}

export function validateEmbedPath(path: unknown): string | null {
  if (typeof path !== 'string' || path.length === 0 || path.length > MAX_EMBED_PATH_LENGTH || !CANONICAL_ROUTE.test(path)) return null
  return path
}

export function validateParentNavigateEvent(
  event: AfterlightParentEvent,
  parentSource: unknown,
  configuredOrigins: readonly string[] = [],
): AutolabsNavigateMessage | null {
  if (event.source !== parentSource || !normalizeEmbedOrigins(configuredOrigins).includes(event.origin)) return null
  const data = event.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null
  const message = data as Record<string, unknown>
  if (message.type !== 'autolabs:navigate' || message.version !== AFTERLIGHT_EMBED_VERSION) return null
  const path = validateEmbedPath(message.path)
  return path ? { type: 'autolabs:navigate', version: AFTERLIGHT_EMBED_VERSION, path } : null
}

export function buildNavigationMessage(path: unknown): AfterlightNavigationMessage | null {
  const validPath = validateEmbedPath(path)
  return validPath ? { type: 'afterlight:navigation', version: AFTERLIGHT_EMBED_VERSION, path: validPath } : null
}

export function buildReadyMessage(): AfterlightReadyMessage {
  return { type: 'afterlight:ready', version: AFTERLIGHT_EMBED_VERSION }
}

export function buildDesignMessage(question: { id: unknown; title: unknown; sourceUrl: unknown }): AfterlightDesignMessage | null {
  if (typeof question.id !== 'string' || !SAFE_IDENTIFIER.test(question.id)) return null
  if (typeof question.title !== 'string' || question.title.length === 0 || question.title.length > MAX_DESIGN_TITLE_LENGTH) return null
  if (typeof question.sourceUrl !== 'string' || question.sourceUrl.length === 0 || question.sourceUrl.length > MAX_SOURCE_URL_LENGTH) return null
  try {
    const source = new URL(question.sourceUrl)
    if (source.protocol !== 'https:' && source.protocol !== 'http:') return null
  } catch {
    return null
  }
  return {
    type: 'afterlight:design',
    version: AFTERLIGHT_EMBED_VERSION,
    question: { id: question.id, title: question.title, sourceUrl: question.sourceUrl },
  }
}

export type EmbedBridge = {
  ready: () => void
  navigation: (path: string) => void
  design: (question: { id: unknown; title: unknown; sourceUrl: unknown }) => boolean
  listen: (onNavigate: (path: string) => void) => () => void
}

export function createEmbedBridge(
  enabled: boolean,
  configuredOrigins: readonly string[] = [],
  targetOrigin = configuredOrigins.length ? normalizeEmbedOrigins(configuredOrigins)[1] || AUTOLABS_ORIGIN : AUTOLABS_ORIGIN,
  hostWindow: Window = window,
): EmbedBridge | null {
  if (!enabled || hostWindow.parent === hostWindow || !normalizeEmbedOrigins(configuredOrigins).includes(targetOrigin)) return null
  let readySent = false
  let lastNavigation: string | null = null
  const send = (message: AfterlightReadyMessage | AfterlightNavigationMessage | AfterlightDesignMessage) => hostWindow.parent.postMessage(message, targetOrigin)
  return {
    ready: () => { if (!readySent) { readySent = true; send(buildReadyMessage()) } },
    navigation: (path) => { const message = buildNavigationMessage(path); if (message && message.path !== lastNavigation) { lastNavigation = message.path; send(message) } },
    design: (question) => { const message = buildDesignMessage(question); if (!message) return false; send(message); return true },
    listen: (onNavigate) => {
      const onMessage = (event: MessageEvent) => {
        const message = validateParentNavigateEvent(event, hostWindow.parent, configuredOrigins)
        if (!message || message.path === lastNavigation) return
        lastNavigation = message.path
        onNavigate(message.path)
      }
      hostWindow.addEventListener('message', onMessage)
      return () => hostWindow.removeEventListener('message', onMessage)
    },
  }
}
