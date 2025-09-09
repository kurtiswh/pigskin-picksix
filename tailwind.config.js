/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        'xs': '475px',
      },
      fontFamily: {
        'sans': ['Inter', 'ui-sans-serif', 'system-ui'],
      },
      colors: {
        pigskin: {
          50: '#FAF9F7',
          100: '#F3F1ED',
          200: '#E6E1DA',
          300: '#D9D1C7',
          400: '#CCB1A1',
          500: '#4B3621', // Primary pigskin brown
          600: '#3A2B1A',
          700: '#2A1F13',
          800: '#1A140C',
          900: '#0A0905',
        },
        gold: {
          50: '#FEFDF9',
          100: '#FDFBF3',
          200: '#FAF6E6',
          300: '#F7F1DA',
          400: '#F1E7C1',
          500: '#C9A04E', // Goal-post gold
          600: '#B8903E',
          700: '#A6802E',
          800: '#95701E',
          900: '#84600E',
        },
        charcoal: {
          50: '#F6F6F6',
          100: '#E7E7E7',
          200: '#D1D1D1',
          300: '#B0B0B0',
          400: '#888888',
          500: '#6D6D6D',
          600: '#5D5D5D',
          700: '#4F4F4F',
          800: '#454545',
          900: '#3D3D3D',
          950: '#262626',
        }
      },
      backgroundImage: {
        'football-texture': "url('data:image/svg+xml,%3Csvg width=\"20\" height=\"20\" viewBox=\"0 0 20 20\" xmlns=\"http://www.w3.org/2000/svg\"%3E%3Cg fill=\"%23C9A04E\" fill-opacity=\"0.05\" fill-rule=\"evenodd\"%3E%3Ccircle cx=\"3\" cy=\"3\" r=\"3\"/%3E%3Ccircle cx=\"13\" cy=\"13\" r=\"3\"/%3E%3C/g%3E%3C/svg%3E')",
      }
    },
  },
  plugins: [],
}