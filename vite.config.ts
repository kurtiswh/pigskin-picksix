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
  // Explicitly define which environment variables to expose to the client
  define: {
    // Make sure these are available in production builds
    __VITE_SUPABASE_URL__: JSON.stringify(process.env.VITE_SUPABASE_URL),
    __VITE_SUPABASE_ANON_KEY__: JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY),
    __VITE_CFBD_API_KEY__: JSON.stringify(process.env.VITE_CFBD_API_KEY),
    __VITE_RESEND_API_KEY__: JSON.stringify(process.env.VITE_RESEND_API_KEY),
  }
})