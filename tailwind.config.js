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
          bg:         '#1a1a2e',
          card:       '#22223a',
          card2:      '#2a2a44',
          border:     '#33335a',
          border2:    '#3d3d66',
          text:       '#e8e4f0',
          textMid:    '#a8a4b8',
          textFaint:  '#6e6a80',
          lav:        '#b8a9e8',
          lavDim:     '#9888cc',
          sage:       '#8fbfa0',
          sageDim:    '#6a9978',
          amber:      '#e8c88a',
          amberDim:   '#c4a060',
          rose:       '#e88a9a',
          roseDim:    '#cc6878',
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
