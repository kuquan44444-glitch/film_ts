import type { PlaybackHealthSnapshot } from 'src/domain/playback.types'

const healthStore = new Map<string, PlaybackHealthSnapshot>()

export const getPlaybackHealth = (candidateKey: string): PlaybackHealthSnapshot => {
  const existingValue = healthStore.get(candidateKey)

  if (existingValue) return existingValue

  return {
    candidateKey,
    successCount: 0,
    failureCount: 0
  }
}

export const markPlaybackHealthSuccess = (candidateKey: string) => {
  const currentValue = getPlaybackHealth(candidateKey)
  const nextValue: PlaybackHealthSnapshot = {
    ...currentValue,
    successCount: currentValue.successCount + 1,
    lastSuccessAt: Date.now()
  }

  healthStore.set(candidateKey, nextValue)
  return nextValue
}

export const markPlaybackHealthFailure = (candidateKey: string) => {
  const currentValue = getPlaybackHealth(candidateKey)
  const nextValue: PlaybackHealthSnapshot = {
    ...currentValue,
    failureCount: currentValue.failureCount + 1,
    lastFailureAt: Date.now()
  }

  healthStore.set(candidateKey, nextValue)
  return nextValue
}
