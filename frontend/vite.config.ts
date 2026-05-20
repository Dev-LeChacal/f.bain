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
            '/max-filesize': 'https://share.oliveri.dev',
            '/upload': 'https://share.oliveri.dev',
        }
    }
} )