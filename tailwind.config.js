/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#1565C0', dark: '#0D47A1', 50: '#EAF2FB', 100: '#D6E6F7' },
        teal: { DEFAULT: '#00897B', 50: '#E6F4F2' },
        ink: { DEFAULT: '#172B4D', soft: '#5B6B85', mute: '#8794AB' },
        canvas: '#F5F8FC',
        line: '#E1E8F2',
        success: '#2E7D32',
        warning: '#F9A825',
        danger: '#D32F2F',
      },
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      boxShadow: { card: '0 1px 2px rgba(23,43,77,.06), 0 2px 6px rgba(23,43,77,.04)' },
    },
  },
  plugins: [],
};
