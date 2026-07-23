import { ImgHTMLAttributes, useEffect, useMemo, useState } from 'react'

type SmartImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  src?: string
  candidates?: string[]
}

const DEFAULT_IMAGE = '/img-error.webp'

const SmartImage = ({ src = '', candidates = [], alt = '', ...props }: SmartImageProps) => {
  const sources = useMemo(() => {
    const merged = Array.from(new Set([src, ...candidates, DEFAULT_IMAGE].filter(Boolean)))
    return merged.length ? merged : [DEFAULT_IMAGE]
  }, [candidates, src])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(0)
  }, [sources])

  return (
    <img
      {...props}
      alt={alt}
      src={sources[index]}
      onError={() => {
        setIndex((currentIndex) => Math.min(currentIndex + 1, sources.length - 1))
      }}
    />
  )
}

export default SmartImage
