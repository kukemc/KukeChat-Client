import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#f8fafc',
        surface: {
          DEFAULT: '#171717',
          raised: '#202020',
          muted: '#262626',
          soft: '#3a3a3a'
        },
        graphite: {
          50: '#fafafa',
          100: '#f4f4f5',
          200: '#e4e4e7',
          300: '#d4d4d8',
          500: '#71717a',
          700: '#3f3f46',
          900: '#171717'
        }
      },
      boxShadow: {
        float: '0 24px 70px rgba(0, 0, 0, 0.34)',
        soft: '0 10px 28px rgba(0, 0, 0, 0.18)',
        liquid: 'inset 0 1px 0 rgba(255,255,255,0.08)'
      },
      backgroundImage: {
        'aurora': 'linear-gradient(180deg, #242424 0%, #171717 100%)',
        'liquid-noise': 'linear-gradient(180deg, #202020 0%, #171717 100%)'
      }
    }
  },
  plugins: []
} satisfies Config;
