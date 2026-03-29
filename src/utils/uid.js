// Generate a simple unique ID (for optimistic UI before Supabase assigns UUID)
export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
