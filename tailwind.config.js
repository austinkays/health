/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        salve: {
          bg:        'rgb(var(--salve-bg) / <alpha-value>)',
          card:      'rgb(var(--salve-card) / <alpha-value>)',
          card2:     'rgb(var(--salve-card2) / <alpha-value>)',
          border:    'rgb(var(--salve-border) / <alpha-value>)',
          border2:   'rgb(var(--salve-border2) / <alpha-value>)',
          text:      'rgb(var(--salve-text) / <alpha-value>)',
          textMid:   'rgb(var(--salve-textMid) / <alpha-value>)',
          textFaint: 'rgb(var(--salve-textFaint) / <alpha-value>)',
          lav:       'rgb(var(--salve-lav) / <alpha-value>)',
          lavDim:    'rgb(var(--salve-lavDim) / <alpha-value>)',
          sage:      'rgb(var(--salve-sage) / <alpha-value>)',
          sageDim:   'rgb(var(--salve-sageDim) / <alpha-value>)',
          amber:     'rgb(var(--salve-amber) / <alpha-value>)',
          amberDim:  'rgb(var(--salve-amberDim) / <alpha-value>)',
          rose:      'rgb(var(--salve-rose) / <alpha-value>)',
          roseDim:   'rgb(var(--salve-roseDim) / <alpha-value>)',
        },
      },
      fontFamily: {
        playfair:   ['"Playfair Display"', 'serif'],
        montserrat: ['Montserrat', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
