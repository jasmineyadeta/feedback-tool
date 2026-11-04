import Link from 'next/link';

/** Shared shell for /privacy and /contact: readable column, links to each other. */
export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 md:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <div className="mt-6 space-y-6 text-sm leading-6 text-ink [&_h2]:text-base [&_h2]:font-semibold [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
      <SiteLinks className="mt-10 border-t border-line pt-4" />
    </main>
  );
}

export function SiteLinks({ className = '' }: { className?: string }) {
  return (
    <nav aria-label="About this tool" className={`flex gap-4 text-xs text-muted ${className}`}>
      <Link href="/privacy" className="underline hover:text-ink">
        Privacy
      </Link>
      <Link href="/contact" className="underline hover:text-ink">
        Contact and takedown
      </Link>
    </nav>
  );
}
