import classNames from 'classnames'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Helmet } from 'react-helmet-async'
import { useQuery } from 'react-query'
import { Link, createSearchParams, useParams } from 'react-router-dom'
import filmApis from 'src/apis/filmApis'
import { useQueryConfig } from 'src/hooks'
import { episodeData, episodeServer, movieSource } from 'src/types'
import PATH from 'src/utils/path'
import FacebookShareButton from 'react-share/es/FacebookShareButton'

type PlaybackType = 'hls' | 'embed'

type PlaybackAttempt = {
  id: string
  url: string
  type: PlaybackType
  server: episodeServer
  episode: episodeData
}

type HlsErrorPayload = {
  fatal?: boolean
}

type HlsInstance = {
  loadSource: (url: string) => void
  attachMedia: (media: HTMLVideoElement) => void
  on: (eventName: string, callback: (_eventName: string, data?: HlsErrorPayload) => void) => void
  destroy: () => void
}

type HlsStatic = {
  new (config?: Record<string, unknown>): HlsInstance
  isSupported: () => boolean
  Events: {
    MANIFEST_PARSED: string
    ERROR: string
  }
}

declare global {
  interface Window {
    Hls?: HlsStatic
  }
}

const HLS_SCRIPT_URL = 'https://cdn.jsdelivr.net/npm/hls.js@1.5.18/dist/hls.min.js'
const SOURCE_SHORT_LABELS: Record<movieSource, string> = {
  ophim: 'o',
  kkphim: 'k',
  vsmov: 'v',
  nguonc: 'n'
}

let hlsScriptPromise: Promise<HlsStatic | null> | null = null

const loadHlsLibrary = () => {
  if (typeof window === 'undefined') return Promise.resolve(null)
  if (window.Hls) return Promise.resolve(window.Hls)
  if (hlsScriptPromise) return hlsScriptPromise

  hlsScriptPromise = new Promise((resolve) => {
    const existingScript = document.querySelector<HTMLScriptElement>('script[data-hls-loader="true"]')

    if (existingScript) {
      existingScript.addEventListener('load', () => resolve(window.Hls ?? null), { once: true })
      existingScript.addEventListener('error', () => resolve(null), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = HLS_SCRIPT_URL
    script.async = true
    script.dataset.hlsLoader = 'true'
    script.onload = () => resolve(window.Hls ?? null)
    script.onerror = () => resolve(null)
    document.head.appendChild(script)
  })

  return hlsScriptPromise
}

const normalizeLabelText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()

const getLanguageVariant = (server: episodeServer, defaultLang: string) => {
  const normalized = normalizeLabelText(`${server.original_server_name} ${defaultLang}`)

  if (normalized.includes('thuyet minh') || normalized.includes('long tieng') || normalized.includes('dub')) {
    return 'thuyết minh'
  }

  if (
    normalized.includes('vietsub') ||
    normalized.includes('phu de') ||
    normalized.includes('subtitle') ||
    normalized.includes('sub')
  ) {
    return 'vietsub'
  }

  return defaultLang ? defaultLang.toLowerCase() : 'nguồn'
}

const buildSourceChipLabel = (server: episodeServer, index: number, defaultLang: string) => {
  const shortLabel = SOURCE_SHORT_LABELS[server.source]
  return `${shortLabel}-${getLanguageVariant(server, defaultLang)} ${index + 1}`
}

const Film = () => {
  const queryConfig = useQueryConfig()
  const [nameServer, setNameServer] = useState<string>('')
  const [episodeSlug, setEpisodeSlug] = useState<string>('')
  const [isPlayerLoading, setIsPlayerLoading] = useState<boolean>(false)
  const [attemptedPlaybacks, setAttemptedPlaybacks] = useState<string[]>([])
  const [activeAttempt, setActiveAttempt] = useState<PlaybackAttempt | null>(null)
  const fallbackTimerRef = useRef<number>()
  const videoRef = useRef<HTMLVideoElement>(null)
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
  const selectedServer = useMemo(
    () => servers.find((item) => item.server_name === nameServer) ?? servers[0],
    [nameServer, servers]
  )
  const selectedEpisode = useMemo(() => {
    if (!selectedServer) return undefined
    return selectedServer.server_data.find((item) => item.slug === episodeSlug) ?? selectedServer.server_data[0]
  }, [episodeSlug, selectedServer])
  const clearFallbackTimer = useCallback(() => {
    if (fallbackTimerRef.current) {
      window.clearTimeout(fallbackTimerRef.current)
      fallbackTimerRef.current = undefined
    }
  }, [])

  const destroyHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy()
      hlsRef.current = null
    }

    if (videoRef.current) {
      videoRef.current.pause()
      videoRef.current.removeAttribute('src')
      videoRef.current.load()
    }
  }, [])

  const getEpisodeForServer = useCallback((server: episodeServer, preferredEpisode?: episodeData) => {
    if (!preferredEpisode) return server.server_data[0]

    return (
      server.server_data.find(
        (item) =>
          item.slug === preferredEpisode.slug ||
          item.name === preferredEpisode.name ||
          item.filename === preferredEpisode.filename
      ) ?? server.server_data[0]
    )
  }, [])

  const buildPlaybackAttempts = useCallback(
    (options?: { preferredEpisode?: episodeData; preferredServerName?: string }) => {
      const prioritizedServers = options?.preferredServerName
        ? [
            ...servers.filter((server) => server.server_name === options.preferredServerName),
            ...servers.filter((server) => server.server_name !== options.preferredServerName)
          ]
        : servers

      return prioritizedServers.flatMap((server) => {
        const nextEpisode = getEpisodeForServer(server, options?.preferredEpisode)
        if (!nextEpisode) return []

        const attempts: PlaybackAttempt[] = []

        if (nextEpisode.link_m3u8) {
          attempts.push({
            id: `${server.server_name}:${nextEpisode.slug}:hls`,
            url: nextEpisode.link_m3u8,
            type: 'hls',
            server,
            episode: nextEpisode
          })
        }

        if (nextEpisode.link_embed) {
          attempts.push({
            id: `${server.server_name}:${nextEpisode.slug}:embed`,
            url: nextEpisode.link_embed,
            type: 'embed',
            server,
            episode: nextEpisode
          })
        }

        return attempts
      })
    },
    [getEpisodeForServer, servers]
  )

  const activateAttempt = useCallback(
    (attempt?: PlaybackAttempt | null, options?: { resetAttempts?: boolean }) => {
      if (!attempt) return

      clearFallbackTimer()
      setNameServer(attempt.server.server_name)
      setEpisodeSlug(attempt.episode.slug)
      setActiveAttempt(attempt)
      setIsPlayerLoading(true)
      setAttemptedPlaybacks((previous) => {
        if (options?.resetAttempts) return [attempt.id]
        return Array.from(new Set([...previous, attempt.id]))
      })
    },
    [clearFallbackTimer]
  )

  const activateServer = useCallback(
    (
      server: episodeServer,
      options?: {
        preferredEpisode?: episodeData
        resetAttempts?: boolean
      }
    ) => {
      const [nextAttempt] = buildPlaybackAttempts({
        preferredEpisode: options?.preferredEpisode,
        preferredServerName: server.server_name
      })

      activateAttempt(nextAttempt, { resetAttempts: options?.resetAttempts })
    },
    [activateAttempt, buildPlaybackAttempts]
  )

  const handleFallback = useCallback(() => {
    if (!activeAttempt) return

    const nextAttempt = buildPlaybackAttempts({
      preferredEpisode: activeAttempt.episode,
      preferredServerName: activeAttempt.server.server_name
    }).find((attempt) => !attemptedPlaybacks.includes(attempt.id))

    if (!nextAttempt) {
      clearFallbackTimer()
      destroyHls()
      setIsPlayerLoading(false)
      return
    }

    activateAttempt(nextAttempt)
  }, [activeAttempt, activateAttempt, attemptedPlaybacks, buildPlaybackAttempts, clearFallbackTimer, destroyHls])

  const handleVideoReady = useCallback(() => {
    clearFallbackTimer()
    setIsPlayerLoading(false)
  }, [clearFallbackTimer])

  const handleVideoWaiting = useCallback(() => {
    setIsPlayerLoading(true)
  }, [])

  useEffect(() => {
    setNameServer('')
    setEpisodeSlug('')
    setAttemptedPlaybacks([])
    setActiveAttempt(null)
    setIsPlayerLoading(false)
    clearFallbackTimer()
    destroyHls()
  }, [clearFallbackTimer, destroyHls, slug])

  useEffect(() => {
    if (servers.length && !activeAttempt) {
      activateServer(servers[0], {
        resetAttempts: true
      })
    }
  }, [activateServer, activeAttempt, servers])

  useEffect(() => {
    if (!selectedServer) return

    const nextEpisode =
      selectedServer.server_data.find((item) => item.slug === episodeSlug) ?? selectedServer.server_data[0]

    if (nextEpisode && episodeSlug !== nextEpisode.slug) {
      setEpisodeSlug(nextEpisode.slug)
    }
  }, [episodeSlug, selectedServer])

  useEffect(() => {
    if (!activeAttempt) return

    setIsPlayerLoading(true)
    clearFallbackTimer()
    fallbackTimerRef.current = window.setTimeout(() => {
      handleFallback()
    }, activeAttempt.type === 'hls' ? 15000 : 12000)

    return () => {
      clearFallbackTimer()
    }
  }, [activeAttempt, clearFallbackTimer, handleFallback])

  useEffect(() => {
    if (!activeAttempt || activeAttempt.type !== 'hls') {
      destroyHls()
      return
    }

    const video = videoRef.current

    if (!video) return

    let isCancelled = false
    const onVideoError = () => {
      if (!isCancelled) handleFallback()
    }

    video.addEventListener('loadeddata', handleVideoReady)
    video.addEventListener('canplay', handleVideoReady)
    video.addEventListener('playing', handleVideoReady)
    video.addEventListener('waiting', handleVideoWaiting)
    video.addEventListener('stalled', onVideoError)
    video.addEventListener('error', onVideoError)

    const setupHlsPlayback = async () => {
      if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = activeAttempt.url
        void video.play().catch(() => undefined)
        return
      }

      const Hls = await loadHlsLibrary()
      if (isCancelled) return

      if (!Hls || !Hls.isSupported()) {
        handleFallback()
        return
      }

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true
      })

      hlsRef.current = hls
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        if (isCancelled) return
        void video.play().catch(() => undefined)
      })
      hls.on(Hls.Events.ERROR, (_eventName, data) => {
        if (isCancelled || !data?.fatal) return
        handleFallback()
      })
      hls.loadSource(activeAttempt.url)
      hls.attachMedia(video)
    }

    void setupHlsPlayback()

    return () => {
      isCancelled = true
      video.removeEventListener('loadeddata', handleVideoReady)
      video.removeEventListener('canplay', handleVideoReady)
      video.removeEventListener('playing', handleVideoReady)
      video.removeEventListener('waiting', handleVideoWaiting)
      video.removeEventListener('stalled', onVideoError)
      video.removeEventListener('error', onVideoError)
      destroyHls()
    }
  }, [activeAttempt, destroyHls, handleFallback, handleVideoReady, handleVideoWaiting])

  useEffect(() => {
    return () => {
      clearFallbackTimer()
      destroyHls()
    }
  }, [clearFallbackTimer, destroyHls])

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
            <div className='absolute inset-0 z-10 flex items-center justify-center bg-black/45'>
              <span className='h-11 w-11 animate-spin rounded-full border-[3px] border-white/20 border-t-white' />
            </div>
          )}
          {activeAttempt?.type === 'hls' ? (
            <video
              key={activeAttempt.id}
              ref={videoRef}
              className='w-full h-full bg-black'
              controls
              autoPlay
              playsInline
              preload='auto'
            />
          ) : (
            <iframe
              key={activeAttempt?.id || 'empty-player'}
              className='w-full h-full'
              title={dataFilm.item.name}
              src={activeAttempt?.url || ''}
              frameBorder={0}
              loading='eager'
              allow='autoplay; encrypted-media; picture-in-picture; fullscreen'
              onLoad={() => {
                clearFallbackTimer()
                setIsPlayerLoading(false)
              }}
              onError={() => handleFallback()}
              allowFullScreen
            ></iframe>
          )}
        </div>
        <div className='container mt-4 flex flex-wrap items-center gap-2 px-4'>
          {servers.map((item, index) => (
            <button
              title={`${item.source_label} - ${item.original_server_name}`}
              onClick={() =>
                activateServer(item, {
                  preferredEpisode: selectedEpisode,
                  resetAttempts: true
                })
              }
              key={item.server_name}
              className={classNames(
                'whitespace-nowrap rounded-md border px-3 py-2 text-[11px] font-semibold transition',
                {
                  'border-lime-400 bg-lime-400/15 text-lime-300': item.server_name === nameServer,
                  'border-white/15 bg-white/5 text-white/75 hover:border-white/30 hover:bg-white/10':
                    item.server_name !== nameServer
                }
              )}
            >
              {buildSourceChipLabel(item, index, dataFilm.item.lang)}
            </button>
          ))}
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
            {selectedServer?.server_data.map((item, index) => (
              <button
                title={`Tập ${item.name}`}
                onClick={() => {
                  const [nextAttempt] = buildPlaybackAttempts({
                    preferredEpisode: item,
                    preferredServerName: selectedServer.server_name
                  })

                  activateAttempt(nextAttempt, { resetAttempts: true })
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
