import type { PlaybackMode } from 'src/providers/base/provider.types'

export type PlaybackPreference = {
  preferredServerIndex: number
  preferredPlaybackMode: PlaybackMode
  preferredVersionLabel: string
}

const STORAGE_KEY = 'vphim.playback-preference'

const defaultPreference: PlaybackPreference = {
  preferredServerIndex: 0,
  preferredPlaybackMode: 'm3u8',
  preferredVersionLabel: ''
}

const isBrowser = () => typeof window !== 'undefined'

export const getPlaybackPreferenceStorage = (): PlaybackPreference => {
  if (!isBrowser()) return defaultPreference

  try {
    const rawValue = window.localStorage.getItem(STORAGE_KEY)
    if (!rawValue) return defaultPreference

    return {
      ...defaultPreference,
      ...(JSON.parse(rawValue) as Partial<PlaybackPreference>)
    }
  } catch {
    return defaultPreference
  }
}

export const setPlaybackPreferenceStorage = (value: Partial<PlaybackPreference>) => {
  if (!isBrowser()) return

  const nextValue = {
    ...getPlaybackPreferenceStorage(),
    ...value
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextValue))
}
