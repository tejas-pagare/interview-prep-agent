import Link from "next/link";

export default function NotFound() {
  return (
    <main className="container">
      <div className="card empty">
        <h2>Page not found</h2>
        <p>The page you are looking for does not exist.</p>
        <Link className="btn" href="/">Back to dashboard</Link>
      </div>
    </main>
  );
}
