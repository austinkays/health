// Color palette, backward-compatible theme-aware proxy.
// Components that import { C } get hex strings from the active theme.
// For React components, prefer useTheme().C for explicit reactivity.
import { getActiveC } from '../hooks/useTheme';

export const C = new Proxy({}, {
  get(_, prop) {
    return getActiveC()[prop];
  },
});
