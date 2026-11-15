import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
export function StatCard({ label, value, detail, icon: Icon, tone = 'green' }: { label: string; value: ReactNode; detail?: ReactNode; icon?: LucideIcon; tone?: string }) {
  return <div className={`stat-card stat-${tone}`}><div className="stat-heading"><span>{label}</span>{Icon && <span className="stat-icon"><Icon size={19} /></span>}</div><div className="stat-value">{value}</div>{detail && <div className="stat-detail">{detail}</div>}</div>;
}
