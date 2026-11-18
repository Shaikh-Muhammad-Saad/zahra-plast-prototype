import { useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Search } from 'lucide-react';
import './searchable-select.css';

export type SearchableOption = { value: string; label: string; description?: string };

type Props = {
  label: string;
  value: string;
  options: SearchableOption[];
  onChange: (value: string) => void;
  placeholder: string;
  searchLabel: string;
  searchPlaceholder: string;
  resultsLabel: string;
  emptyMessage: string;
};

export function SearchableSelect({ label, value, options, onChange, placeholder, searchLabel, searchPlaceholder, resultsLabel, emptyMessage }: Props) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find(option => option.value === value);
  const filtered = useMemo(() => {
    const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return options.filter(option => words.every(word => `${option.label} ${option.description ?? ''}`.toLocaleLowerCase().includes(word)));
  }, [options, query]);

  function close(restoreFocus = false) {
    popup.current?.hidePopover();
    setOpen(false);
    if (restoreFocus) trigger.current?.focus({ preventScroll: true });
  }

  function show() {
    setQuery('');
    setActive(Math.max(0, options.findIndex(option => option.value === value)));
    popup.current?.showPopover();
    setOpen(true);
  }

  function choose(option: SearchableOption) {
    onChange(option.value);
    close(true);
  }

  // The native popover stays above modal dialogs. Position within the available
  // viewport, including the smaller visual viewport when a mobile keyboard opens.
  useLayoutEffect(() => {
    if (!open) return;
    const panel = popup.current!;
    const button = trigger.current!;
    const position = () => {
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0;
      const top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth;
      const height = viewport?.height ?? window.innerHeight;
      const below = Math.max(0, top + height - rect.bottom - 18);
      const above = Math.max(0, rect.top - top - 18);
      const placeBelow = below >= 240 || below >= above;
      const panelWidth = Math.min(Math.max(rect.width, 340), width - 24);
      panel.style.width = `${panelWidth}px`;
      panel.style.maxHeight = `${Math.max(0, Math.min(380, height - 24, placeBelow ? below : above))}px`;
      panel.style.left = `${Math.max(left + 12, Math.min(rect.left, left + width - panelWidth - 12))}px`;
      const panelHeight = panel.getBoundingClientRect().height;
      const preferredTop = placeBelow ? rect.bottom + 6 : rect.top - panelHeight - 6;
      panel.style.top = `${Math.max(top + 12, Math.min(preferredTop, top + height - panelHeight - 12))}px`;
    };
    position();
    input.current?.focus({ preventScroll: true });
    const observer = new ResizeObserver(position);
    observer.observe(button);
    observer.observe(panel);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    viewportListen('addEventListener');
    button.closest('dialog')?.addEventListener('transitionend', position);
    function viewportListen(method: 'addEventListener' | 'removeEventListener') {
      window.visualViewport?.[method]('resize', position);
      window.visualViewport?.[method]('scroll', position);
    }
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      viewportListen('removeEventListener');
      button.closest('dialog')?.removeEventListener('transitionend', position);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const item = list.current?.children[active] as HTMLElement | undefined;
    const container = list.current;
    if (!item || !container) return;
    const itemRect = item.getBoundingClientRect();
    const listRect = container.getBoundingClientRect();
    if (itemRect.top < listRect.top) container.scrollTop -= listRect.top - itemRect.top;
    else if (itemRect.bottom > listRect.bottom) container.scrollTop += itemRect.bottom - listRect.bottom;
  }, [open, active, filtered]);

  function navigate(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Escape') {
      event.preventDefault(); event.stopPropagation(); close(true);
    } else if (event.key === 'Tab') {
      // Resume the form's natural tab order from the closed trigger.
      close(true);
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(index => Math.max(0, Math.min(filtered.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (filtered[active]) choose(filtered[active]);
    }
  }

  return <div className="field searchable-select" onBlurCapture={event => {
    if (open && event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
  }}>
    <label className="field-label" id={`${id}-label`} htmlFor={`${id}-trigger`}>{label}</label>
    <button ref={trigger} id={`${id}-trigger`} type="button" className="searchable-select-trigger"
      popoverTarget={`${id}-popup`}
      aria-labelledby={`${id}-label`} aria-describedby={`${id}-value`} aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-popup`}
      onClick={() => {
        if (!open) { setQuery(''); setActive(Math.max(0, options.findIndex(option => option.value === value))); }
      }} onKeyDown={event => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); show(); }
      }}>
      <span id={`${id}-value`} className={selected ? '' : 'searchable-select-placeholder'}>{selected ? `${selected.label}${selected.description ? ` · ${selected.description}` : ''}` : placeholder}</span>
      <ChevronDown size={16} aria-hidden="true" />
    </button>
    <div ref={popup} id={`${id}-popup`} popover="auto" role="dialog" aria-label={`Choose ${label.toLowerCase()}`} className="searchable-select-popover"
      onToggle={event => setOpen(event.newState === 'open')}>
      <div className="searchable-select-search"><Search size={17} aria-hidden="true" />
        <input ref={input} type="text" role="combobox" aria-label={searchLabel} aria-autocomplete="list" aria-expanded={open}
          aria-controls={`${id}-list`} aria-activedescendant={open && filtered[active] ? `${id}-option-${active}` : undefined}
          autoComplete="off" spellCheck={false} placeholder={searchPlaceholder} value={query}
          onChange={event => { setQuery(event.target.value); setActive(0); }} onKeyDown={navigate} />
      </div>
      <div className="searchable-select-count" role="status">{filtered.length} {filtered.length === 1 ? 'result' : 'results'}</div>
      <div ref={list} id={`${id}-list`} role="listbox" aria-label={resultsLabel} className="searchable-select-options">
        {filtered.map((option, index) => <div key={option.value} id={`${id}-option-${index}`} role="option" aria-selected={option.value === value}
          className={`searchable-select-option${index === active ? ' is-highlighted' : ''}`} onPointerMove={() => setActive(index)}
          onMouseDown={event => event.preventDefault()} onClick={() => choose(option)}>
          <span><strong>{option.label}</strong>{option.description && <small>{option.description}</small>}</span>
          {option.value === value && <Check size={16} aria-hidden="true" />}
        </div>)}
      </div>
      {!filtered.length && <div className="searchable-select-empty"><Search size={23} aria-hidden="true" /><strong>{emptyMessage}</strong><span>Try another name or product code.</span></div>}
    </div>
  </div>;
}
