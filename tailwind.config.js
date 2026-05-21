/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#04080f',
          900: '#070d1a',
          800: '#0c1428',
          700: '#111c36',
          600: '#172344',
          500: '#1e2d4f',
          400: '#273d65',
          300: '#34507c',
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
