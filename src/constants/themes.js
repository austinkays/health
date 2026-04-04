// Theme presets — single source of truth for all color themes.
// To add a new theme: add one more entry to the `themes` object. Nothing else changes.

export const THEME_STORAGE_KEY = 'salve:theme';
export const DEFAULT_THEME = 'midnight';

export function hexToRgbTriplet(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r} ${g} ${b}`;
}

export const themes = {
  noir: {
    id: 'noir',
    label: 'Noir',
    description: 'Pure black, minimal & modern',
    type: 'dark',
    colors: {
      bg:        '#0a0a0a',
      card:      '#141414',
      card2:     '#1c1c1c',
      border:    '#2a2a2a',
      border2:   '#363636',
      text:      '#ebebeb',
      textMid:   '#999999',
      textFaint: '#5c5c5c',
      lav:       '#a0a0a0',
      lavDim:    '#787878',
      sage:      '#8c9a8c',
      sageDim:   '#6b7a6b',
      amber:     '#bfb09a',
      amberDim:  '#998a74',
      rose:      '#b89090',
      roseDim:   '#997070',
    },
    ambiance: {
      morning: '140, 154, 140',
      day:     '160, 160, 160',
      evening: '191, 176, 154',
      night:   '120, 120, 120',
    },
  },

  midnight: {
    id: 'midnight',
    label: 'Midnight',
    description: 'Navy with lavender & sage',
    type: 'dark',
    colors: {
      bg:        '#1a1a2e',
      card:      '#22223a',
      card2:     '#2a2a44',
      border:    '#33335a',
      border2:   '#3d3d66',
      text:      '#e8e4f0',
      textMid:   '#a8a4b8',
      textFaint: '#6e6a80',
      lav:       '#b8a9e8',
      lavDim:    '#9888cc',
      sage:      '#8fbfa0',
      sageDim:   '#6a9978',
      amber:     '#e8c88a',
      amberDim:  '#c4a060',
      rose:      '#e88a9a',
      roseDim:   '#cc6878',
    },
    ambiance: {
      morning: '143, 191, 160',
      day:     '184, 169, 232',
      evening: '232, 200, 138',
      night:   '152, 136, 204',
    },
  },

  ember: {
    id: 'ember',
    label: 'Ember',
    description: 'Charcoal with copper & gold',
    type: 'dark',
    colors: {
      bg:        '#1c1714',
      card:      '#2a2220',
      card2:     '#352c28',
      border:    '#4a3d36',
      border2:   '#5c4d44',
      text:      '#f0e6dc',
      textMid:   '#baa898',
      textFaint: '#806e60',
      lav:       '#d4a574',
      lavDim:    '#b8885a',
      sage:      '#e8c46a',
      sageDim:   '#c4a248',
      amber:     '#e89070',
      amberDim:  '#cc6e50',
      rose:      '#d46a5a',
      roseDim:   '#b85040',
    },
    ambiance: {
      morning: '232, 196, 106',
      day:     '212, 165, 116',
      evening: '232, 144, 112',
      night:   '184, 136, 90',
    },
  },

  dawnlight: {
    id: 'dawnlight',
    label: 'Dawnlight',
    description: 'Warm cream, light & airy',
    type: 'light',
    colors: {
      bg:        '#faf7f2',
      card:      '#ffffff',
      card2:     '#f3efe8',
      border:    '#e0d8cc',
      border2:   '#cdc4b6',
      text:      '#2c2520',
      textMid:   '#6b5e52',
      textFaint: '#9e9286',
      lav:       '#7c6aaa',
      lavDim:    '#9580c4',
      sage:      '#3d8a5c',
      sageDim:   '#5aa87a',
      amber:     '#b8860b',
      amberDim:  '#d4a030',
      rose:      '#c45060',
      roseDim:   '#d8788a',
    },
    ambiance: {
      morning: '61, 138, 92',
      day:     '124, 106, 170',
      evening: '184, 134, 11',
      night:   '149, 128, 196',
    },
  },

  frost: {
    id: 'frost',
    label: 'Frost',
    description: 'Slate with ice blue & mint',
    type: 'dark',
    colors: {
      bg:        '#161b22',
      card:      '#1e2630',
      card2:     '#26303c',
      border:    '#334155',
      border2:   '#3e4f65',
      text:      '#e2e8f0',
      textMid:   '#94a3b8',
      textFaint: '#64748b',
      lav:       '#7cc4e8',
      lavDim:    '#5aa8cc',
      sage:      '#6ee7b7',
      sageDim:   '#4eca98',
      amber:     '#c4b5fd',
      amberDim:  '#a78bfa',
      rose:      '#fda4af',
      roseDim:   '#e8788a',
    },
    ambiance: {
      morning: '110, 231, 183',
      day:     '124, 196, 232',
      evening: '196, 181, 253',
      night:   '90, 168, 204',
    },
  },
};
