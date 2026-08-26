/**
 * Internal-tier layout. Applies a dark canvas over the atWork-branded sidebar,
 * matching BFT's internal-page composition (see BFT src/internal/components/
 * layout/AppLayout.tsx). Sidebar itself is the shared brand sidebar with the
 * tier switcher — the dark canvas here only affects the content area.
 */
export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full bg-gray-950 text-gray-200">
      <div className="max-w-7xl mx-auto p-4 md:p-6">
        {children}
      </div>
    </div>
  );
}
