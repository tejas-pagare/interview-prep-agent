"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="container">
      <div className="card empty">
        <h2>Something went wrong</h2>
        <p>An unexpected error occurred. Your interview progress is saved.</p>
        <button className="btn" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
