import { useEffect, useId, useRef } from 'react';
import { TriangleAlert } from 'lucide-react';
import { Button } from '../../components/ui';
import './unsaved-changes-notice.css';

type Props = {
  revealRequest: number;
  onKeepEditing: () => void;
  onDiscard: () => void;
};

export function UnsavedChangesNotice({ revealRequest, onKeepEditing, onDiscard }: Props) {
  const id = useId();
  const noticeRef = useRef<HTMLElement>(null);
  const keepEditingRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const notice = noticeRef.current;
    const scroller = notice?.closest<HTMLElement>('.modal-content');
    if (!notice || !scroller) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    keepEditingRef.current?.focus({ preventScroll: true });
    scroller.scrollTo({
      top: Math.max(0, scroller.scrollTop + notice.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16),
      behavior: reducedMotion ? 'instant' : 'smooth',
    });
    // Repeat the visual cue when the user tries closing again from further down.
    const highlight = reducedMotion ? undefined : notice.animate([
      { boxShadow: '0 0 0 0 rgba(180, 111, 17, .28)' },
      { boxShadow: '0 0 0 7px rgba(180, 111, 17, 0)' },
    ], { duration: 800, easing: 'ease-out' });
    return () => highlight?.cancel();
  }, [revealRequest]);

  return <section ref={noticeRef} className="sales-unsaved-notice" aria-labelledby={`${id}-title`}>
    <span className="sales-unsaved-icon" aria-hidden="true"><TriangleAlert size={23} /></span>
    <div className="sales-unsaved-copy" role="alert" aria-atomic="true">
      <h3 id={`${id}-title`}>You have unsaved changes</h3>
      <p id={`${id}-description`}>Save your draft to keep these changes, or discard them to exit. Your last saved version will remain unchanged.</p>
    </div>
    <div className="sales-unsaved-actions">
      <Button ref={keepEditingRef} variant="primary" aria-describedby={`${id}-title ${id}-description`} onClick={onKeepEditing}>Keep editing</Button>
      <Button variant="danger" onClick={onDiscard}>Discard changes</Button>
    </div>
  </section>;
}
