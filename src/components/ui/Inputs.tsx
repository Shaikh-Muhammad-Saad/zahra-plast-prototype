import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  return <label className="field"><span className="field-label">{label}</span>{children}{hint && <span className="field-hint">{hint}</span>}{error && <span className="field-error" role="alert">{error}</span>}</label>;
}
export function SearchInput({ value, onChange, placeholder = 'Search…' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <div className="search-input"><Search size={17} aria-hidden="true" /><input type="search" aria-label={placeholder} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} /></div>;
}
