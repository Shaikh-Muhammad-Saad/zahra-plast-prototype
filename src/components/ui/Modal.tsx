import { useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import './modal.css';

type ModalContent = {
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

type ModalProps = ModalContent & {
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
};

export function Modal({ open, title, description, onClose, onExited, children, footer, wide = false }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const lastContent = useRef<ModalContent | null>(null);
  const afterExit = useRef(onExited);
  const [present, setPresent] = useState(open);
  const id = useId();

  useLayoutEffect(() => {
    afterExit.current = onExited;
    if (open) lastContent.current = { title, description, children, footer, wide };
  });

  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let timeout = 0;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timeout);
      dialog.removeEventListener('transitionend', onTransitionEnd);
      reducedMotion.removeEventListener('change', onMotionChange);
      dialog.close();
      dialog.dataset.state = 'closed';
      lastContent.current = null;
      setPresent(false);
      afterExit.current?.();
    };
    const onTransitionEnd = (event: TransitionEvent) => {
      if (event.target === dialog && !event.pseudoElement && event.propertyName === 'opacity') finish();
    };
    const onMotionChange = () => { if (reducedMotion.matches) finish(); };

    if (open) {
      setPresent(true);
      if (!dialog.open) {
        dialog.dataset.state = 'closed';
        dialog.showModal();
        // Establish the starting styles before transitioning a newly shown dialog.
        getComputedStyle(dialog).opacity;
        getComputedStyle(dialog, '::backdrop').opacity;
      }
      if (reducedMotion.matches) dialog.dataset.state = 'open';
      else frame = window.requestAnimationFrame(() => { dialog.dataset.state = 'open'; });
    } else if (dialog.open) {
      dialog.dataset.state = 'closing';
      const styles = getComputedStyle(dialog);
      const milliseconds = (value: string) => parseFloat(value) * (value.trim().endsWith('ms') ? 1 : 1000);
      const durations = styles.transitionDuration.split(',').map(milliseconds);
      const delays = styles.transitionDelay.split(',').map(milliseconds);
      const duration = Math.max(...durations.map((value, index) => value + delays[index % delays.length]));
      if (reducedMotion.matches || duration < 1 || Number(styles.opacity) === 0) finish();
      else {
        dialog.addEventListener('transitionend', onTransitionEnd);
        reducedMotion.addEventListener('change', onMotionChange);
        // Also close if a transition is cancelled, styles change, or the tab is hidden.
        timeout = window.setTimeout(finish, duration + 60);
      }
    }

    return () => {
      finished = true;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
      dialog.removeEventListener('transitionend', onTransitionEnd);
      reducedMotion.removeEventListener('change', onMotionChange);
    };
  }, [open]);

  // Callers often clear their selected record immediately. Keep its content intact
  // while closing, then unmount it so reopening starts with fresh form state.
  const content = open ? { title, description, children, footer, wide } : present ? lastContent.current : null;
  const requestClose = () => { if (open) onClose(); };

  return <dialog ref={ref} className={`modal ${content?.wide ? 'modal-wide' : ''}`} aria-labelledby={id} aria-describedby={content?.description ? `${id}-description` : undefined} onCancel={event => { event.preventDefault(); requestClose(); }} onClick={event => { if (event.target === ref.current) requestClose(); }}>
    {content && <div className="modal-inner" inert={!open}>
      <div className="modal-heading"><div><h2 id={id}>{content.title}</h2>{content.description && <p id={`${id}-description`}>{content.description}</p>}</div><button type="button" className="icon-button" aria-label="Close dialog" onClick={requestClose}><X size={20} /></button></div>
      <div className="modal-content">{content.children}</div>
      {content.footer && <div className="modal-footer">{content.footer}</div>}
    </div>}
  </dialog>;
}
