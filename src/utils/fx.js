// Cursor-follow micro-interactions. Used via onPointerMove / onPointerLeave.
// All handlers mutate the DOM directly (CSS vars / transform) so React never
// re-renders on mousemove.

// Spotlight: updates --mx/--my on the target to the cursor position as a
// percentage within its bounding rect. Pair with a ::before radial-gradient
// layer that reads those vars.
export function handleSpotlight(e) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
}

// Magnetic pull: translates the target a fraction of the distance from its
// center toward the cursor. Add the `.magnetic` class for the easing transition.
export function handleMagnet(e, strength = 0.28) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  const dx = (e.clientX - (r.left + r.width / 2)) * strength;
  const dy = (e.clientY - (r.top + r.height / 2)) * strength;
  el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
}

export function resetMagnet(e) {
  e.currentTarget.style.transform = '';
}
