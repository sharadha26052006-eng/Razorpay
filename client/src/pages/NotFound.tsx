import { Link } from 'react-router-dom';
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-night px-4 text-center text-ivory">
      <p className="font-display text-8xl font-extrabold text-mint">404</p>
      <p className="text-ivory/70">This page doesn't exist.</p>
      <Link to="/" className="btn bg-mint text-night">Back to home</Link>
    </div>
  );
}
