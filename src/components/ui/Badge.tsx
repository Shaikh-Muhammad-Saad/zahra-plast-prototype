import type { ReactNode } from 'react';
export function Badge({ children, tone = 'gray' }: { children: ReactNode; tone?: 'green' | 'amber' | 'red' | 'gray' | 'blue' | 'purple' }) {
  return <span className={`badge badge-${tone}`}><span className="badge-dot" aria-hidden="true" />{children}</span>;
}
