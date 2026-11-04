import Link from 'next/link';

export function Shell({
  children,
  signedIn = true,
}: {
  children: React.ReactNode;
  signedIn?: boolean;
}) {
  return (
    <div className="min-h-full">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
          <Link href="/reviews" className="font-semibold">
            Feedback
          </Link>
          {signedIn && (
            <form action="/api/auth/sign-out" method="post">
              <button className="text-sm text-muted hover:text-ink">Sign out</button>
            </form>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8">{children}</main>
    </div>
  );
}

export const btn = {
  primary:
    'inline-flex items-center justify-center rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50',
  secondary:
    'inline-flex items-center justify-center rounded-md border border-line bg-white px-4 py-2 text-sm font-medium hover:bg-paper disabled:opacity-50',
  danger:
    'inline-flex items-center justify-center rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50',
};

const STATUS: Record<string, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  submitted: 'Submitted',
  revoked: 'Revoked',
};
export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'submitted'
      ? 'bg-green-50 text-green-800 ring-green-200'
      : status === 'revoked'
        ? 'bg-gray-100 text-gray-600 ring-gray-200'
        : status === 'in_progress'
          ? 'bg-blue-50 text-blue-800 ring-blue-200'
          : 'bg-white text-muted ring-line';
  return (
    <span
      data-testid="invite-status"
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tone}`}
    >
      {STATUS[status] ?? status}
    </span>
  );
}
