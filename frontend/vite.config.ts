import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig( {
    plugins: [
        react(),
        tailwindcss()
    ],
    build: {
        outDir: '../static',
        emptyOutDir: true
    },
    server: {
        proxy: {
            '/upload': {
                target: 'http://localhost:3333',
                ws: true,
                rewriteWsOrigin: true
            },
            '^/(?!@)[^/]+/meta$': { target: 'http://localhost:3333' },
            '^/(?!@)[^/]+/raw$': { target: 'http://localhost:3333', ws: true },
            '^/(?!@)[^/]+/expire$': { target: 'http://localhost:3333' },
            '^/(?!@)[^/]+$': {
                target: 'http://localhost:3333',
                bypass: (req) => {
                    if ( req.method === 'GET' ) return req.url
                    return null
                }
            }
        }
    }
} )