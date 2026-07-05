import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  // Ensure environment variables are available in production
  envPrefix: ['VITE_'],
  build: {
    rollupOptions: {
      output: {
        // Split large vendor deps into their own chunks to cut the main bundle.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          supabase: ['@supabase/supabase-js'],
          quill: ['react-quill'],
        },
      },
    },
  },
})