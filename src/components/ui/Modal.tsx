import { useEffect, useRef, type ReactNode, useId } from 'react';
import { X } from 'lucide-react';
export function Modal({ open, title, description, onClose, children, footer, wide = false }: { open: boolean; title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null); const id = useId();
  useEffect(() => { const dialog = ref.current; if (open && !dialog?.open) dialog?.showModal(); if (!open && dialog?.open) dialog.close(); }, [open]);
  return <dialog ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} aria-labelledby={id} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === ref.current) onClose(); }}>
    <div className="modal-inner"><div className="modal-heading"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>
    <div className="modal-content">{children}</div>{footer && <div className="modal-footer">{footer}</div>}</div>
  </dialog>;
}
