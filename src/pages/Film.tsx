import classNames from 'classnames'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from 'react-query'
import { Link, createSearchParams, useParams } from 'react-router-dom'
import FacebookShareButton from 'react-share/es/FacebookShareButton'
import filmApis from 'src/apis/filmApis'
import type { PlaybackCandidate } from 'src/domain/playback.types'
import { useQueryConfig } from 'src/hooks'
import { buildPlaybackCandidates, selectPlaybackCandidate } from 'src/services/media-selection.service'
import {
  createPlaybackCandidateKey,
  markPlaybackHealthFailure,
  markPlaybackHealthSuccess
} from 'src/services/playback-health.service'
import { getPlaybackPreferenceStorage, setPlaybackPreferenceStorage } from 'src/storage/playback-preference.storage'
import type { episodeServer } from 'src/types'
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
const PLAYER_PROBING_MESSAGE = 'Đang kiểm tra chất lượng nguồn...'
const PLAYER_SWITCHING_MESSAGE = 'Đang chuyển server...'

type ServerEntry = episodeServer & {
  serverId: string
  displayName: string
  index: number
}

const createServerId = (server: episodeServer, index: number) => `${server.source}:${index}:${server.server_name}`

const findEpisodeForServer = (server?: episodeServer, episodeSlug?: string) => {
  if (!server) return undefined
  if (!episodeSlug) return server.server_data[0]

  return server.server_data.find((item) => item.slug === episodeSlug) ?? server.server_data[0]
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
  const [preferredServerId, setPreferredServerId] = useState<string>('')
  const [activeServerId, setActiveServerId] = useState<string>('')
  const [episodeSlug, setEpisodeSlug] = useState<string>('')
  const [playerMessage, setPlayerMessage] = useState<string>('')
  const [isPlayerLoading, setIsPlayerLoading] = useState<boolean>(false)
  const [activeCandidate, setActiveCandidate] = useState<PlaybackCandidate | null>(null)
  const [fallbackQueue, setFallbackQueue] = useState<PlaybackCandidate[]>([])
  const [availableServerIds, setAvailableServerIds] = useState<string[]>([])
  const [playerReloadToken, setPlayerReloadToken] = useState<number>(0)
  const fallbackTimerRef = useRef<number>()
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const hlsRef = useRef<HlsInstance | null>(null)
  const resolutionSequenceRef = useRef(0)
  const resolutionMessageRef = useRef<string>(PLAYER_PROBING_MESSAGE)
  const { slug } = useParams()
  const { data } = useQuery({
    queryKey: [slug],
    queryFn: () => filmApis.getFilm(slug as string),
    staleTime: 3 * 60 * 1000,
    enabled: slug !== ''
  })
  const dataFilm = data?.data.data
  const servers = useMemo(() => dataFilm?.item.episodes ?? [], [dataFilm])
  const serverEntries = useMemo<ServerEntry[]>(
    () =>
      servers.map((server, index) => ({
        ...server,
        serverId: createServerId(server, index),
        displayName: `Server ${index + 1}`,
        index
      })),
    [servers]
  )
  const visibleServers = useMemo(
    () =>
      availableServerIds.length
        ? serverEntries.filter((server) => availableServerIds.includes(server.serverId))
        : serverEntries,
    [availableServerIds, serverEntries]
  )
  const activeServer =
    serverEntries.find((server) => server.serverId === activeServerId) ??
    serverEntries.find((server) => server.serverId === preferredServerId) ??
    visibleServers[0]
  const selectedEpisode = useMemo(() => findEpisodeForServer(activeServer, episodeSlug), [activeServer, episodeSlug])

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

  const resolvePlaybackSelection = useCallback(async () => {
    if (!serverEntries.length) return

    const nextSequence = resolutionSequenceRef.current + 1
    resolutionSequenceRef.current = nextSequence
    clearFallbackTimer()
    destroyHls()
    setIsPlayerLoading(true)
    setPlayerMessage(resolutionMessageRef.current || PLAYER_PROBING_MESSAGE)

    const preferredServer = serverEntries.find((server) => server.serverId === preferredServerId) ?? serverEntries[0]
    const preferredEpisode = findEpisodeForServer(preferredServer, episodeSlug)
    const candidates = await buildPlaybackCandidates({
      servers,
      preferredEpisode,
      preferredServerId
    })
    const selection = selectPlaybackCandidate(candidates)

    if (resolutionSequenceRef.current !== nextSequence) return

    setAvailableServerIds(Array.from(new Set(candidates.map((candidate) => candidate.serverId))))

    if (!selection.selected) {
      setActiveCandidate(null)
      setFallbackQueue([])
      setActiveServerId('')
      setIsPlayerLoading(false)
      setPlayerMessage('Hiện chưa tìm thấy nguồn phát trực tiếp hợp lệ cho tập này.')
      return
    }

    const nextServerIndex = serverEntries.findIndex((server) => server.serverId === selection.selected?.serverId)
    setActiveCandidate(selection.selected)
    setFallbackQueue(selection.fallbackQueue)
    setActiveServerId(selection.selected.serverId)
    if (episodeSlug !== selection.selected.episodeSlug) {
      setEpisodeSlug(selection.selected.episodeSlug)
    }
    setPlaybackPreferenceStorage({
      preferredServerIndex: nextServerIndex >= 0 ? nextServerIndex : 0,
      preferredPlaybackMode: 'm3u8'
    })
    bumpPlayerReloadToken()
  }, [bumpPlayerReloadToken, clearFallbackTimer, destroyHls, episodeSlug, preferredServerId, serverEntries, servers])

  const handlePlaybackFailure = useCallback(
    (reason: string) => {
      if (!activeCandidate) return

      markPlaybackHealthFailure(
        createPlaybackCandidateKey({
          providerKey: activeCandidate.providerKey,
          serverId: activeCandidate.serverId,
          episodeKey: activeCandidate.episodeKey,
          playbackUrl: activeCandidate.playbackUrl
        })
      )

      const [nextCandidate, ...remainingCandidates] = fallbackQueue
      if (!nextCandidate) {
        clearFallbackTimer()
        setIsPlayerLoading(false)
        setPlayerMessage(`${reason}. Hiện không còn server khả dụng.`)
        return
      }

      const nextServer = serverEntries.find((server) => server.serverId === nextCandidate.serverId)
      clearFallbackTimer()
      destroyHls()
      setActiveCandidate(nextCandidate)
      setFallbackQueue(remainingCandidates)
      setActiveServerId(nextCandidate.serverId)
      setEpisodeSlug(nextCandidate.episodeSlug)
      setIsPlayerLoading(true)
      setPlayerMessage(`${reason}. Đang chuyển sang ${nextServer?.displayName.toLowerCase() || 'server dự phòng'}.`)
      bumpPlayerReloadToken()
    },
    [activeCandidate, bumpPlayerReloadToken, clearFallbackTimer, destroyHls, fallbackQueue, serverEntries]
  )

  useEffect(() => {
    clearFallbackTimer()
    destroyHls()
    setPreferredServerId('')
    setActiveServerId('')
    setEpisodeSlug('')
    setPlayerMessage('')
    setIsPlayerLoading(false)
    setActiveCandidate(null)
    setFallbackQueue([])
    setAvailableServerIds([])
    setPlayerReloadToken(0)
  }, [clearFallbackTimer, destroyHls, slug])

  useEffect(() => {
    if (!serverEntries.length) return

    const { preferredServerIndex } = getPlaybackPreferenceStorage()
    const preferredServer = serverEntries[preferredServerIndex] ?? serverEntries[0]
    const initialEpisode = findEpisodeForServer(preferredServer, episodeSlug)

    if (!preferredServerId) {
      setPreferredServerId(preferredServer.serverId)
    }

    if (!episodeSlug && initialEpisode) {
      setEpisodeSlug(initialEpisode.slug)
      setPlayerMessage(DEFAULT_PLAYER_MESSAGE)
    }
  }, [episodeSlug, preferredServerId, serverEntries])

  useEffect(() => {
    if (!serverEntries.length || !episodeSlug) return
    void resolvePlaybackSelection()
  }, [episodeSlug, preferredServerId, resolvePlaybackSelection, serverEntries])

  useEffect(() => {
    if (!activeCandidate || !videoRef.current) {
      destroyHls()
      return
    }

    const videoElement = videoRef.current
    let isCancelled = false

    const handleReady = () => {
      clearFallbackTimer()
      setIsPlayerLoading(false)
      setPlayerMessage(PLAYER_READY_MESSAGE)
      markPlaybackHealthSuccess(
        createPlaybackCandidateKey({
          providerKey: activeCandidate.providerKey,
          serverId: activeCandidate.serverId,
          episodeKey: activeCandidate.episodeKey,
          playbackUrl: activeCandidate.playbackUrl
        })
      )
    }

    const handleError = () => {
      if (!isCancelled) {
        handlePlaybackFailure('Lựa chọn hiện tại phát sinh lỗi')
      }
    }

    const startFallbackTimer = () => {
      clearFallbackTimer()
      fallbackTimerRef.current = window.setTimeout(() => {
        handlePlaybackFailure('Lựa chọn hiện tại phản hồi chậm hoặc lỗi')
      }, 12000)
    }

    setIsPlayerLoading(true)
    startFallbackTimer()
    videoElement.addEventListener('loadedmetadata', handleReady)
    videoElement.addEventListener('canplay', handleReady)
    videoElement.addEventListener('playing', handleReady)
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

        handlePlaybackFailure('Trình duyệt không hỗ trợ phát m3u8')
      } catch (_error) {
        if (!isCancelled) {
          handlePlaybackFailure('Không thể khởi tạo trình phát m3u8')
        }
      }
    }

    void initializeVideo()

    return () => {
      isCancelled = true
      videoElement.removeEventListener('loadedmetadata', handleReady)
      videoElement.removeEventListener('canplay', handleReady)
      videoElement.removeEventListener('playing', handleReady)
      videoElement.removeEventListener('error', handleError)
      destroyHls()
      clearFallbackTimer()
    }
  }, [activeCandidate, clearFallbackTimer, destroyHls, handlePlaybackFailure, playerReloadToken])

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
              key={`${activeCandidate.serverId}-${activeCandidate.episodeSlug}-${activeCandidate.format}-${playerReloadToken}`}
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
              Hiện chưa có nguồn phát trực tiếp phù hợp cho nội dung này.
            </div>
          )}
        </div>
        <div className='container mt-4 px-4'>
          <div className='rounded-md border border-white/10 bg-[#0e274073] p-3 text-sm text-white/80'>
            {playerMessage || DEFAULT_PLAYER_MESSAGE}
          </div>
        </div>
        {visibleServers.length > 0 ? (
          <div className='mt-6 flex items-center justify-center gap-2'>
            {visibleServers.map((item) => {
              const isActive = item.serverId === activeServer?.serverId
              return (
                <button
                  title={item.displayName}
                  onClick={() => {
                    resolutionMessageRef.current = PLAYER_SWITCHING_MESSAGE
                    setPreferredServerId(item.serverId)
                    setEpisodeSlug((currentEpisodeSlug) => {
                      const nextEpisode = findEpisodeForServer(item, currentEpisodeSlug)
                      return nextEpisode?.slug || item.server_data[0]?.slug || ''
                    })
                    setIsPlayerLoading(true)
                    setPlayerMessage(PLAYER_SWITCHING_MESSAGE)
                  }}
                  key={item.serverId}
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
                    {item.displayName}
                  </span>
                </button>
              )
            })}
          </div>
        ) : (
          <div className='container mt-6 px-4 text-center text-sm text-white/60'>Hiện chưa lấy được lựa chọn phát.</div>
        )}
        <div className='container px-4 mt-2'>
          <p className='text-sm text-white/60'>
            Nếu phim bị lag, đứng hoặc lỗi, trình phát sẽ tự chuyển server trước khi bạn phải đổi tay.
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
            {activeServer?.server_data.map((item, index) => (
              <button
                title={`Tập ${item.name}`}
                onClick={() => {
                  resolutionMessageRef.current = `Đang chuyển sang tập ${item.name}...`
                  setEpisodeSlug(item.slug)
                  setIsPlayerLoading(true)
                  setPlayerMessage(`Đang chuyển sang tập ${item.name}...`)
                }}
                disabled={item.slug === selectedEpisode?.slug}
                key={index}
                className={classNames(
                  'flex-shrink-0 text-white whitespace-nowrap overflow-hidden text-lg min-w-[99px] h-[40px] px-4 rounded',
                  {
                    'bg-green-400': item.slug !== selectedEpisode?.slug,
                    'bg-green-400/40': item.slug === selectedEpisode?.slug
                  }
                )}
              >
                Tập {item.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
export default Film
