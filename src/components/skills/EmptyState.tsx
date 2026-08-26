/**
 * EmptyState
 *
 * Centered placeholder shown when a list or table has no rows. A bit
 * more visible than "—": icon, primary message, optional helper text,
 * and an optional CTA.
 *
 *   <EmptyState icon={<ArrowRightLeft />} message="No agency data found" />
 *   <EmptyState
 *     icon={<Inbox />}
 *     message="No pending submissions"
 *     helper="Submissions appear here once an agency completes a stocktake."
 *     cta={<button onClick={…}>Refresh</button>}
 *   />
 */
import type { ReactNode } from 'react';

export interface EmptyStateProps {
  icon?:    ReactNode;
  message:  string;
  helper?:  string;
  cta?:     ReactNode;
}

export function EmptyState({ icon, message, helper, cta }: EmptyStateProps) {
  return (
    <div className="text-center py-12">
      {icon && <div className="mx-auto mb-4 text-gray-700 [&_svg]:h-12 [&_svg]:w-12 [&_svg]:mx-auto">{icon}</div>}
      <p className="text-sm font-medium text-gray-500">{message}</p>
      {helper && <p className="text-xs text-gray-600 mt-2 max-w-md mx-auto">{helper}</p>}
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}
