/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          900: '#060913',
          800: '#0A0F1C',
          700: '#111827'
        },
        cyan: {
          400: '#00F0FF',
          500: '#00D1FF'
        },
        pink: {
          500: '#FF0055',
          600: '#D90048'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Archivo Black', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      }
    },
  },
  plugins: [],
}
