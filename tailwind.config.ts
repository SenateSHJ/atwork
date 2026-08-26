import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        ink:    'rgb(var(--brand-ink) / <alpha-value>)',
        accent: 'rgb(var(--brand-accent) / <alpha-value>)',
        sand:   'rgb(var(--brand-sand) / <alpha-value>)',
        sky:    'rgb(var(--brand-sky) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
