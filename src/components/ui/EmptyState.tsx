import { SearchX, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
export function EmptyState({ icon: Icon = SearchX, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Icon size={27} /></div><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>;
}
