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
  midnight: {
    id: 'midnight',
    label: 'Midnight',
    description: 'Navy with lavender & sage',
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

  frost: {
    id: 'frost',
    label: 'Frost',
    description: 'Slate with ice blue & mint',
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
