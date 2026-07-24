import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const useSourceProxy = env.VITE_USE_SOURCE_PROXY === 'true'

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: useSourceProxy
        ? {
            '/proxy/ophim': {
              target: env.VITE_OPHIM_API_URL || env.VITE_API_URL || 'https://ophim1.com',
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/proxy\/ophim/, '')
            },
            '/proxy/kkphim': {
              target: env.VITE_KKPHIM_API_URL || 'https://phimapi.com',
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/proxy\/kkphim/, '')
            },
            '/proxy/vsmov': {
              target: env.VITE_VSMOV_API_URL || 'https://vsmov.com/api',
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/proxy\/vsmov/, '')
            },
            '/proxy/nguonc': {
              target: env.VITE_NGUONC_API_URL || 'https://phim.nguonc.com/api',
              changeOrigin: true,
              rewrite: (requestPath) => requestPath.replace(/^\/proxy\/nguonc/, '')
            }
          }
        : undefined
    },
    css: {
      devSourcemap: true
    },
    resolve: {
      alias: {
        src: path.resolve(__dirname, './src')
      }
    }
  }
})
