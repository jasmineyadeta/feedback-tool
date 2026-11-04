/** Same page for unknown, revoked and deleted links, so a link's state can't be probed. */
export default function ReviewLinkNotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6">
      <h1 className="text-xl font-semibold">This review link isn’t available</h1>
      <p className="mt-2 text-sm text-muted">
        It may have been turned off or mistyped. Ask the person who sent it for a new link.
      </p>
    </main>
  );
}
