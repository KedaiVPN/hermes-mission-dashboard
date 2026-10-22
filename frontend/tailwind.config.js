/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0c',
        'bg-card': '#111114',
        'bg-hover': '#1a1a1f',
        border: '#27272a',
        accent: '#2563eb',
        'accent-hover': '#1d4ed8',
        'accent-light': 'rgba(37, 99, 235, 0.15)',
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        mono: ['SF Mono', 'Fira Code', 'Roboto Mono', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [],
}
