import { useState } from 'react';

export default function useConfirmDelete() {
  const [pending, setPending] = useState(null);

  const ask = (id, label) => setPending({ id, label });
  const cancel = () => setPending(null);
  const confirm = (onDelete) => {
    if (pending) {
      onDelete(pending.id);
      setPending(null);
    }
  };

  return { pending, ask, cancel, confirm };
}
