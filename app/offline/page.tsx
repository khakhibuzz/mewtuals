export default function OfflinePage() {
  return (
    <main className="offline-page">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Must perform a document navigation from the offline fallback. */}
      <a className="offline-wordmark" href="/">
        Mewtuals
      </a>
      <div className="offline-content">
        <p className="offline-eyebrow">Connection required</p>
        <h1>Get online to see your partnerships.</h1>
        <p>
          Your partnership information will be available when your connection returns.
        </p>
        <div className="offline-actions">
          <a className="primary-button" href="?retry">
            Try again
          </a>
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Must perform a document navigation from the offline fallback. */}
          <a className="text-link" href="/">
            Back to the landing page
          </a>
        </div>
      </div>
    </main>
  );
}
