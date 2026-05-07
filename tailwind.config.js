/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      spacing: {
        '18': '4.5rem',
      },
      colors: {
        profit: {
          DEFAULT: '#22c55e',
          light: '#4ade80',
          dark: '#16a34a',
          glow: 'rgba(34, 197, 94, 0.35)',
        },
        loss: {
          DEFAULT: '#ef4444',
          light: '#f87171',
          dark: '#dc2626',
          glow: 'rgba(239, 68, 68, 0.35)',
        },
        neutral: {
          DEFAULT: '#eab308',
          light: '#facc15',
          dark: '#ca8a04',
        },
        accent: {
          DEFAULT: '#7c3aed',
          light: '#a78bfa',
          dark: '#6d28d9',
        },
        ink: {
          DEFAULT: '#06070a',
          surface: '#0d0f14',
          raised: '#12141b',
          card: '#161922',
          border: '#1f2330',
          hover: '#1f2330',
          muted: '#9ba3b4',
        },
        // Legacy aliases - keep existing components working
        dark: {
          bg: '#06070a',
          card: '#12141b',
          border: '#1f2330',
          hover: '#1f2330',
        },
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
      },
      backgroundImage: {
        'glass-radial':
          'radial-gradient(circle at top, rgba(124, 58, 237, 0.12), transparent 60%)',
        'profit-gradient': 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
        'loss-gradient': 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
        'accent-gradient': 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)',
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(255, 255, 255, 0.04), 0 8px 32px rgba(0, 0, 0, 0.45)',
        'profit-glow': '0 0 24px -4px rgba(34, 197, 94, 0.45)',
        'loss-glow': '0 0 24px -4px rgba(239, 68, 68, 0.45)',
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
}
