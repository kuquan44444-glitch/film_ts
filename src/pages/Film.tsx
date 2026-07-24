import classNames from 'classnames'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from 'react-query'
import { Link, createSearchParams, useParams } from 'react-router-dom'
import FacebookShareButton from 'react-share/es/FacebookShareButton'
import filmApis from 'src/apis/filmApis'
import { providerMap } from 'src/apis/filmSourceAdapters'
import type { PlaybackCandidate } from 'src/domain/playback.types'
import { getPlaybackCandidateKey, preparePlaybackSelection } from 'src/services/media-selection.service'
import { markPlaybackHealthFailure, markPlaybackHealthSuccess } from 'src/services/playback-health.service'
import { getPlaybackPreferenceStorage, setPlaybackPreferenceStorage } from 'src/storage/playback-preference.storage'
import { useQueryConfig } from 'src/hooks'
import type { episodeData, episodeServer } from 'src/types'
import PATH from 'src/utils/path'

type HlsInstance = {
  loadSource: (source: string) => void
  attachMedia: (video: HTMLVideoElement) => void
  on: (event: string, handler: (event: string, data?: { fatal?: boolean }) => void) => void
  destroy: () => void
}

type HlsConstructor = {
  new (config?: Record<string, unknown>): HlsInstance
  isSupported: () => boolean
  Events: {
    MANIFEST_PARSED: string
    ERROR: string
  }
}

let hlsScriptPromise: Promise<HlsConstructor | null> | null = null
const DEFAULT_PLAYER_MESSAGE = 'Đang chuẩn bị phát phim.'
const PLAYER_READY_MESSAGE = 'Đang phát phim.'
const PLAYER_LOADING_MESSAGE = 'Đang tải phim...'
const PLAYER_CHECKING_MESSAGE = 'Đang kiểm tra chất lượng nguồn...'

type EpisodeOption = {
  key: string
  label: string
  order: number
}

const normalizeEpisodeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

const createEpisodeKey = (episode: Pick<episodeData, 'slug' | 'filename' | 'name'>) => {
  const slugValue = normalizeEpisodeText(episode.slug)
  if (slugValue) return `slug:${slugValue}`

  const filenameValue = normalizeEpisodeText(episode.filename)
  if (filenameValue) return `file:${filenameValue}`

  return `name:${normalizeEpisodeText(episode.name || 'full')}`
}

const extractEpisodeOrder = (episode: Pick<episodeData, 'name' | 'filename' | 'slug'>, fallbackIndex: number) => {
  const numericValue = Number(episode.name)
  if (Number.isFinite(numericValue) && numericValue > 0) {
    return numericValue
  }

  const matchedNumber = episode.filename.match(/\d+/)?.[0] ?? episode.slug.match(/\d+/)?.[0]
  if (matchedNumber) {
    return Number(matchedNumber)
  }

  return fallbackIndex + 1
}

const getPlaybackScore = (server: episodeServer, candidate: Pick<PlaybackCandidate, 'format' | 'resolverType'>) => {
  const providerScoreMap: Record<episodeServer['source'], number> = {
    ophim: 96,
    kkphim: 82,
    vsmov: 76,
    nguonc: 20
  }

  let score = providerScoreMap[server.source] ?? 60
  score += candidate.format === 'm3u8' ? 8 : 6
  score += candidate.resolverType === 'direct' ? 6 : 2
  return score
}

const loadHlsConstructor = async () => {
  if (typeof window === 'undefined') return null

  const existingHls = (window as Window & { Hls?: HlsConstructor }).Hls
  if (existingHls) return existingHls

  if (!hlsScriptPromise) {
    hlsScriptPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector<HTMLScriptElement>('script[data-hls-player="true"]')

      if (existingScript) {
        existingScript.addEventListener(
          'load',
          () => resolve((window as Window & { Hls?: HlsConstructor }).Hls ?? null),
          { once: true }
        )
        existingScript.addEventListener('error', () => reject(new Error('Không thể tải thư viện phát HLS.')), {
          once: true
        })
        return
      }

      const script = document.createElement('script')
      script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.20/dist/hls.min.js'
      script.async = true
      script.dataset.hlsPlayer = 'true'
      script.onload = () => resolve((window as Window & { Hls?: HlsConstructor }).Hls ?? null)
      script.onerror = () => reject(new Error('Không thể tải thư viện phát HLS.'))
      document.body.appendChild(script)
    })
  }

  return hlsScriptPromise
}

const Film = () => {
  const queryConfig = useQueryConfig()
  const [selectedEpisodeKey, setSelectedEpisodeKey] = useState<string>('')
  const [playerMessage, setPlayerMessage] = useState<string>('')
  const [isPlayerLoading, setIsPlayerLoading] = useState<boolean>(false)
  const [playbackCandidates, setPlaybackCandidates] = useState<PlaybackCandidate[]>([])
  const [activeCandidateIndex, setActiveCandidateIndex] = useState<number>(0)
  const [attemptedCandidateKeys, setAttemptedCandidateKeys] = useState<string[]>([])
  const [playerReloadToken, setPlayerReloadToken] = useState<number>(0)
  const fallbackTimerRef = useRef<number>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<HlsInstance | null>(null)
  const { slug } = useParams()
  const { data } = useQuery({
    queryKey: [slug],
    queryFn: () => filmApis.getFilm(slug as string),
    staleTime: 3 * 60 * 1000,
    enabled: slug !== ''
  })
  const dataFilm = data?.data.data
  const servers = useMemo(() => dataFilm?.item.episodes ?? [], [dataFilm])
  const episodeOptions = useMemo<EpisodeOption[]>(() => {
    const episodeMap = new Map<string, EpisodeOption>()

    servers.forEach((server) => {
      server.server_data.forEach((episode, index) => {
        const episodeKey = createEpisodeKey(episode)
        const currentEpisode = episodeMap.get(episodeKey)
        const nextEpisode: EpisodeOption = {
          key: episodeKey,
          label: episode.name || episode.filename || `Tập ${index + 1}`,
          order: extractEpisodeOrder(episode, index)
        }

        if (!currentEpisode) {
          episodeMap.set(episodeKey, nextEpisode)
          return
        }

        episodeMap.set(episodeKey, {
          ...currentEpisode,
          label: currentEpisode.label || nextEpisode.label,
          order: Math.min(currentEpisode.order, nextEpisode.order)
        })
      })
    })

    return Array.from(episodeMap.values()).sort((left, right) => left.order - right.order)
  }, [servers])
  const selectedEpisode = useMemo(
    () => episodeOptions.find((item) => item.key === selectedEpisodeKey) ?? episodeOptions[0],
    [episodeOptions, selectedEpisodeKey]
  )
  const activeCandidate = playbackCandidates[activeCandidateIndex] ?? null
  const activeCandidateKey = activeCandidate ? getPlaybackCandidateKey(activeCandidate) : ''
  const activeServerLabel = activeCandidate ? `Server ${activeCandidateIndex + 1}` : ''

  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current)
    }
  }, [])

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }
  }, [])

  const bumpPlayerReloadToken = useCallback(() => {
    setPlayerReloadToken((previous) => previous + 1)
  }, [])

  const resolveCandidatesForEpisode = useCallback(
    async (episodeOption: EpisodeOption): Promise<PlaybackCandidate[]> => {
      const settledCandidates = await Promise.allSettled(
        servers.map(async (server) => {
          const matchedEpisode = server.server_data.find((item) => createEpisodeKey(item) === episodeOption.key)
          const provider = providerMap[server.source]

          if (!matchedEpisode || !provider.resolveMedia) return []

          const resolvedCandidates = await provider.resolveMedia({
            episode: matchedEpisode,
            server
          })

          return resolvedCandidates
            .filter(
              (candidate) =>
                /^https?:\/\//i.test(candidate.playbackUrl) &&
                (candidate.format === 'm3u8' || candidate.format === 'mp4')
            )
            .map(
              (candidate, index): PlaybackCandidate => ({
                serverId: `${server.source}:${server.server_name}:${index}`,
                episodeKey: episodeOption.key,
                playbackUrl: candidate.playbackUrl,
                format: candidate.format,
                qualityLabel: candidate.qualityLabel || dataFilm?.item.quality,
                providerKey: candidate.providerKey,
                resolverType: candidate.resolverType,
                viaProxy: false,
                healthScore: getPlaybackScore(server, candidate)
              })
            )
        })
      )

      const uniqueCandidates = new Map<string, PlaybackCandidate>()
      settledCandidates.forEach((result) => {
        if (result.status !== 'fulfilled') return

        result.value.forEach((candidate) => {
          const candidateKey = `${candidate.providerKey}:${candidate.format}:${candidate.playbackUrl}`
          if (!uniqueCandidates.has(candidateKey)) {
            uniqueCandidates.set(candidateKey, candidate)
          }
        })
      })

      return Array.from(uniqueCandidates.values())
    },
    [dataFilm?.item.quality, servers]
  )

  const activateCandidate = useCallback(
    (
      candidateIndex: number,
      options?: {
        message?: string
        resetAttempts?: boolean
      }
    ) => {
      const nextCandidate = playbackCandidates[candidateIndex]
      if (!nextCandidate) return

      clearFallbackTimer()
      destroyHls()
      bumpPlayerReloadToken()
      setActiveCandidateIndex(candidateIndex)
      setIsPlayerLoading(true)
      setPlayerMessage(options?.message || `${PLAYER_LOADING_MESSAGE} ${`Server ${candidateIndex + 1}`}`)
      setAttemptedCandidateKeys((previous) => {
        const nextKey = getPlaybackCandidateKey(nextCandidate)
        if (options?.resetAttempts) return [nextKey]
        return Array.from(new Set([...previous, nextKey]))
      })
      setPlaybackPreferenceStorage({
        preferredServerIndex: candidateIndex,
        preferredPlaybackMode: nextCandidate.format
      })
    },
    [bumpPlayerReloadToken, clearFallbackTimer, destroyHls, playbackCandidates]
  )

  const handleCandidateFallback = useCallback(
    (reason: string) => {
      if (activeCandidateKey) {
        markPlaybackHealthFailure(activeCandidateKey)
      }

      const nextCandidateIndex = playbackCandidates.findIndex(
        (candidate, index) =>
          index > activeCandidateIndex && !attemptedCandidateKeys.includes(getPlaybackCandidateKey(candidate))
      )

      if (nextCandidateIndex === -1) {
        clearFallbackTimer()
        setIsPlayerLoading(false)
        setPlayerMessage(`${reason}. Không còn nguồn trực tiếp khả dụng cho tập này.`)
        return
      }

      activateCandidate(nextCandidateIndex, {
        message: `${reason}. Đang chuyển sang Server ${nextCandidateIndex + 1}.`
      })
    },
    [
      activateCandidate,
      activeCandidateIndex,
      activeCandidateKey,
      attemptedCandidateKeys,
      clearFallbackTimer,
      playbackCandidates
    ]
  )

  useEffect(() => {
    clearFallbackTimer()
    destroyHls()
    setSelectedEpisodeKey('')
    setPlayerMessage('')
    setIsPlayerLoading(false)
    setPlaybackCandidates([])
    setActiveCandidateIndex(0)
    setAttemptedCandidateKeys([])
    setPlayerReloadToken(0)
  }, [clearFallbackTimer, destroyHls, slug])

  useEffect(() => {
    if (episodeOptions.length && !selectedEpisodeKey) {
      setSelectedEpisodeKey(episodeOptions[0].key)
    }
  }, [episodeOptions, selectedEpisodeKey])

  useEffect(() => {
    if (selectedEpisodeKey && !episodeOptions.some((item) => item.key === selectedEpisodeKey)) {
      setSelectedEpisodeKey(episodeOptions[0]?.key || '')
    }
  }, [episodeOptions, selectedEpisodeKey])

  useEffect(() => {
    let isCancelled = false

    const resolvePlaybackCandidates = async () => {
      if (!selectedEpisode) {
        setPlaybackCandidates([])
        setActiveCandidateIndex(0)
        setAttemptedCandidateKeys([])
        setIsPlayerLoading(false)
        setPlayerMessage(DEFAULT_PLAYER_MESSAGE)
        return
      }

      setIsPlayerLoading(true)
      setPlayerMessage(PLAYER_CHECKING_MESSAGE)
      const resolvedCandidates = await resolveCandidatesForEpisode(selectedEpisode)

      if (isCancelled) return

      if (!resolvedCandidates.length) {
        clearFallbackTimer()
        destroyHls()
        setPlaybackCandidates([])
        setActiveCandidateIndex(0)
        setAttemptedCandidateKeys([])
        setIsPlayerLoading(false)
        setPlayerMessage('Hiện chưa có nguồn phát trực tiếp phù hợp cho tập này.')
        return
      }

      const selection = await preparePlaybackSelection(resolvedCandidates)
      if (isCancelled) return

      const orderedCandidates = selection.selected ? [selection.selected, ...selection.fallbackQueue] : []
      const preferredServerIndex = Math.min(
        getPlaybackPreferenceStorage().preferredServerIndex,
        Math.max(orderedCandidates.length - 1, 0)
      )

      setPlaybackCandidates(orderedCandidates)
      setActiveCandidateIndex(preferredServerIndex)
      setAttemptedCandidateKeys(
        orderedCandidates[preferredServerIndex]
          ? [getPlaybackCandidateKey(orderedCandidates[preferredServerIndex])]
          : []
      )
      setPlayerReloadToken((previous) => previous + 1)
      setPlayerMessage(`${PLAYER_LOADING_MESSAGE} Server ${preferredServerIndex + 1}.`)
    }

    void resolvePlaybackCandidates()

    return () => {
      isCancelled = true
    }
  }, [clearFallbackTimer, destroyHls, resolveCandidatesForEpisode, selectedEpisode])

  useEffect(() => {
    if (!activeCandidate || !videoRef.current) {
      destroyHls()
      return
    }

    const videoElement = videoRef.current
    let isCancelled = false
    let hasMarkedReady = false
    const currentCandidateKey = getPlaybackCandidateKey(activeCandidate)

    const handleReady = () => {
      if (hasMarkedReady) return
      hasMarkedReady = true
      clearFallbackTimer()
      setIsPlayerLoading(false)
      setPlayerMessage(`${PLAYER_READY_MESSAGE} ${activeServerLabel}.`)
      markPlaybackHealthSuccess(currentCandidateKey)
      setPlaybackPreferenceStorage({
        preferredServerIndex: activeCandidateIndex,
        preferredPlaybackMode: activeCandidate.format
      })
    }

    const handleError = () => {
      if (!isCancelled) {
        handleCandidateFallback(`${activeServerLabel || 'Server hiện tại'} phát sinh lỗi`)
      }
    }

    const startFallbackTimer = () => {
      clearFallbackTimer()
      fallbackTimerRef.current = window.setTimeout(() => {
        handleError()
      }, 12000)
    }

    setIsPlayerLoading(true)
    startFallbackTimer()
    videoElement.addEventListener('loadedmetadata', handleReady)
    videoElement.addEventListener('canplay', handleReady)
    videoElement.addEventListener('error', handleError)

    const initializeVideo = async () => {
      destroyHls()
      videoElement.pause()
      videoElement.removeAttribute('src')
      videoElement.load()

      if (activeCandidate.format === 'mp4') {
        videoElement.src = activeCandidate.playbackUrl
        videoElement.load()
        void videoElement.play().catch(() => undefined)
        return
      }

      if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
        videoElement.src = activeCandidate.playbackUrl
        videoElement.load()
        void videoElement.play().catch(() => undefined)
        return
      }

      try {
        const Hls = await loadHlsConstructor()
        if (isCancelled) return

        if (Hls?.isSupported()) {
          const hls = new Hls({
            enableWorker: true
          })
          hlsRef.current = hls
          hls.loadSource(activeCandidate.playbackUrl)
          hls.attachMedia(videoElement)
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            void videoElement.play().catch(() => undefined)
          })
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data?.fatal) {
              handleError()
            }
          })
          return
        }

        handleCandidateFallback('Trình duyệt không hỗ trợ phát m3u8')
      } catch (_error) {
        if (!isCancelled) {
          handleCandidateFallback('Không thể khởi tạo trình phát m3u8')
        }
      }
    }

    void initializeVideo()

    return () => {
      isCancelled = true
      videoElement.removeEventListener('loadedmetadata', handleReady)
      videoElement.removeEventListener('canplay', handleReady)
      videoElement.removeEventListener('error', handleError)
      destroyHls()
      clearFallbackTimer()
    }
  }, [
    activeCandidate,
    activeCandidate.format,
    activeCandidate.playbackUrl,
    activeCandidateIndex,
    activeServerLabel,
    clearFallbackTimer,
    destroyHls,
    handleCandidateFallback,
    playerReloadToken
  ])

  if (!dataFilm) return null

  return (
    <>
      <Helmet>
        <title>{`VPhim | ${dataFilm?.seoOnPage.titleHead}`}</title>
        <meta name='description' content={`${dataFilm?.seoOnPage.descriptionHead} | Xem phim miễn phí tại VPhim`} />
      </Helmet>
      <div>
        <div className='relative w-full h-[36vh] sm:h-[56vh] md:h-[66vh] lg:h-[76vh] xl:h-[86vh] bg-black'>
          {isPlayerLoading && (
            <div className='absolute inset-0 z-10 flex items-center justify-center bg-black/40 text-white'>
              {playerMessage || PLAYER_LOADING_MESSAGE}
            </div>
          )}
          {activeCandidate ? (
            <video
              key={`${activeCandidate.serverId}-${activeCandidate.format}-${playerReloadToken}`}
              ref={videoRef}
              className='h-full w-full bg-black'
              controls
              playsInline
              autoPlay
              preload='auto'
            >
              <track kind='captions' label='Vietnamese captions' srcLang='vi' />
            </video>
          ) : (
            <div className='flex h-full w-full items-center justify-center px-6 text-center text-white/70'>
              {selectedEpisode ? 'Tập này hiện chưa có nguồn phát trực tiếp khả dụng.' : 'Đang chuẩn bị danh sách tập.'}
            </div>
          )}
        </div>
        <div className='container mt-4 px-4'>
          <div className='rounded-md border border-white/10 bg-[#0e274073] p-3 text-sm text-white/80'>
            {playerMessage || DEFAULT_PLAYER_MESSAGE}
          </div>
        </div>
        {playbackCandidates.length > 0 ? (
          <div className='mt-6 flex items-center justify-center gap-2'>
            {playbackCandidates.map((candidate, index) => {
              const isActive = index === activeCandidateIndex
              return (
                <button
                  title={`Chọn Server ${index + 1}`}
                  onClick={() =>
                    activateCandidate(index, {
                      resetAttempts: true,
                      message: `Đang chuyển sang Server ${index + 1}.`
                    })
                  }
                  key={getPlaybackCandidateKey(candidate)}
                  className={classNames('rounded px-3 py-2 font-medium', {
                    'bg-white/40': isActive,
                    'bg-white': !isActive
                  })}
                >
                  <span className='flex items-center justify-center gap-1'>
                    {isActive && (
                      <svg
                        xmlns='http://www.w3.org/2000/svg'
                        fill='none'
                        viewBox='0 0 24 24'
                        strokeWidth={3}
                        stroke='currentColor'
                        className='w-4 h-4 stroke-green-500 -ml-1'
                      >
                        <path strokeLinecap='round' strokeLinejoin='round' d='M4.5 12.75l6 6 9-13.5' />
                      </svg>
                    )}
                    {`Server ${index + 1}`}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className='container mt-6 px-4 text-center text-sm text-white/60'>
            Hiện chưa lấy được nguồn phát trực tiếp cho tập này.
          </div>
        )}
        <div className='container px-4 mt-2'>
          <p className='text-sm text-white/60'>
            Player sẽ tự chuyển sang server kế tiếp khi nguồn hiện tại lỗi hoặc phản hồi chậm.
          </p>
        </div>
        <div className='container px-4 mt-6'>
          <div className='block md:flex items-center justify-between mb-10'>
            <div>
              <h1 title={dataFilm.item.origin_name} className='text-white text-5xl font-heading1 leading-[45px] mb-3'>
                {dataFilm.item.origin_name}
              </h1>
              <h2 title={dataFilm.item.name} className='text-[#b5b5b5] text-2xl break-all leading-[30px] mb-2'>
                {dataFilm.item.name} (
                <Link
                  title={`Tìm kiếm ${dataFilm.item.year}`}
                  to={{
                    pathname: `${PATH.list}/${PATH.new}`,
                    search: createSearchParams({
                      ...queryConfig,
                      year: dataFilm.item.year.toString()
                    }).toString()
                  }}
                  className='text-[#428bca] hover:underline'
                >
                  {dataFilm.item.year}
                </Link>
                )
              </h2>
              <FacebookShareButton url={`https://vphim.vercel.app/${PATH.film}/${slug}`}>
                <div
                  title='Chia sẻ phim miễn phí với Facebook'
                  className='text-white w-fit bg-[#485fc7] rounded-sm px-3 py-1 flex items-center justify-center gap-2'
                >
                  <svg className='fill-white w-5 h-5' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 448 512'>
                    <path d='M448 80v352c0 26.5-21.5 48-48 48h-85.3V302.8h60.6l8.7-67.6h-69.3V192c0-19.6 5.4-32.9 33.5-32.9H384V98.7c-6.2-.8-27.4-2.7-52.2-2.7-51.6 0-87 31.5-87 89.4v49.9H184v67.6h60.9V480H48c-26.5 0-48-21.5-48-48V80c0-26.5 21.5-48 48-48h352c26.5 0 48 21.5 48 48z' />
                  </svg>
                  Chia sẻ
                </div>
              </FacebookShareButton>
            </div>
            <Link
              to={`${PATH.film}/${slug}`}
              className='flex items-center gap-2 text-[#428bca] hover:text-lime-400 pt-6 md:pt-0'
            >
              <svg className='w-7 h-7 fill-white' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 576 512'>
                <path d='M11.093 251.65l175.998 184C211.81 461.494 256 444.239 256 408v-87.84c154.425 1.812 219.063 16.728 181.19 151.091-8.341 29.518 25.447 52.232 49.68 34.51C520.16 481.421 576 426.17 576 331.19c0-171.087-154.548-201.035-320-203.02V40.016c0-36.27-44.216-53.466-68.91-27.65L11.093 196.35c-14.791 15.47-14.791 39.83 0 55.3zm23.127-33.18l176-184C215.149 29.31 224 32.738 224 40v120c157.114 0 320 11.18 320 171.19 0 74.4-40 122.17-76.02 148.51C519.313 297.707 395.396 288 224 288v120c0 7.26-8.847 10.69-13.78 5.53l-176-184a7.978 7.978 0 0 1 0-11.06z' />
              </svg>
              Về trang giới thiệu phim
            </Link>
          </div>
          <div className='flex items-center flex-wrap gap-x-3 gap-y-4 max-h-[250px] overflow-auto pb-2 pr-[6px]'>
            {episodeOptions.map((item, index) => (
              <button
                title={item.label}
                onClick={() => {
                  setSelectedEpisodeKey(item.key)
                  setPlaybackCandidates([])
                  setActiveCandidateIndex(0)
                  setAttemptedCandidateKeys([])
                  setIsPlayerLoading(true)
                  setPlayerMessage(`Đang chuyển sang ${item.label}.`)
                }}
                disabled={item.key === selectedEpisode?.key}
                key={index}
                className={classNames(
                  'flex-shrink-0 text-white whitespace-nowrap overflow-hidden text-lg min-w-[99px] h-[40px] px-4 rounded',
                  {
                    'bg-green-400': item.key !== selectedEpisode?.key,
                    'bg-green-400/40': item.key === selectedEpisode?.key
                  }
                )}
              >
                {item.label.startsWith('Tập ') ? item.label : `Tập ${item.label}`}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
export default Film
