const LEGACY_IMAGE_CDN = 'https://img.ophim1.com/uploads/movies/'

const ABSOLUTE_URL_REGEX = /^https?:\/\//i

const getImageUrl = (path?: string) => {
  if (!path) return ''

  if (ABSOLUTE_URL_REGEX.test(path)) {
    return path
  }

  return `${LEGACY_IMAGE_CDN}${path}`
}

export default getImageUrl
