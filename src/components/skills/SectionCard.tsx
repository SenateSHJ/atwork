/**
 * SectionCard
 *
 * The repeated "bordered dark container with a small-caps header" used
 * across every internal page. Wraps children with the standard padding
 * + spacing, and optionally renders a title row with an icon.
 *
 *   <SectionCard title="Agency Breakdown">
 *     <Table … />
 *   </SectionCard>
 *
 *   <SectionCard title="Stocktake Submissions" icon={<Bell />} headerRight={<Badge>3</Badge>}>
 *     …
 *   </SectionCard>
 */
import type { ReactNode } from 'react';

export interface SectionCardProps {
  title?:       string;
  icon?:        ReactNode;
  headerRight?: ReactNode;
  children:     ReactNode;
  className?:   string;
}

export function SectionCard({ title, icon, headerRight, children, className }: SectionCardProps) {
  return (
    <div className={`bg-gray-900 border border-gray-700 rounded-lg p-5 mb-5 ${className ?? ''}`}>
      {title && (
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
            {icon}
            {title}
          </h2>
          {headerRight}
        </div>
      )}
      {children}
    </div>
  );
}
