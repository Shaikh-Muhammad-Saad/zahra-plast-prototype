import { useCallback, useRef, useState } from 'react';

/** Keeps conditionally mounted dialogs alive until their exit animation finishes. */
export function useModalClose() {
  const [open, setOpen] = useState(true);
  const closing = useRef(false);
  const continuation = useRef<(() => void) | null>(null);

  const close = useCallback((afterExit: () => void) => {
    if (closing.current) return;
    closing.current = true;
    continuation.current = afterExit;
    setOpen(false);
  }, []);

  const onExited = useCallback(() => {
    const afterExit = continuation.current;
    continuation.current = null;
    afterExit?.();
  }, []);

  const isClosing = useCallback(() => closing.current, []);

  return { open, close, onExited, isClosing };
}
