/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#166534',
          hover: '#14532d',
          light: '#dcfce7'
        },
        highlight: '#22C55E',
        surface: '#FFFFFF',
        background: '#F8FAFC',
        textMain: '#0F172A',
        textMuted: '#64748B',
        danger: '#DC2626',
        warning: '#F59E0B'
      }
    },
  },
  plugins: [],
}