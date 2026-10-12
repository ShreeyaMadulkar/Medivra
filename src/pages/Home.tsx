import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      <header className="flex h-16 items-center justify-between border-b border-line bg-white px-4 sm:px-6 lg:px-8">
        <Link to="/" aria-label="Medivra home"><Logo /></Link>
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link to="/login" className="btn btn-secondary btn-sm sm:px-4 sm:py-2 sm:text-sm">Sign In</Link>
          <Link to="/register" className="btn btn-primary btn-sm sm:px-4 sm:py-2 sm:text-sm">Register</Link>
        </nav>
      </header>

      <main className="flex flex-1 items-center">
        <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-16 lg:px-8 lg:py-20">
          <div>
            <h1 className="text-3xl font-semibold leading-tight text-ink sm:text-4xl lg:text-[2.75rem]">
              Secure pharmaceutical supply, simplified.
            </h1>
            <p className="mt-4 max-w-md text-base text-ink-soft">
              Medivra helps pharmaceutical distributors and pharmacies manage medicine batches, monitor inventory, and track supply transfers through a centralized platform.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/register" className="btn btn-primary px-5 py-2.5">Get started</Link>
              <Link to="/login" className="btn btn-secondary px-5 py-2.5">Sign in</Link>
            </div>
          </div>

          
          {/* Pharmaceutical supply-chain hero image */}
          <div className="aspect-[4/3] w-full overflow-hidden rounded-xl border border-primary/20 bg-primary-50 lg:aspect-square">
            <img
              src="/images/medivra-hero.jpeg"
              alt="Pharmaceutical medicine distribution and supply chain"
              className="h-full w-full object-cover"
            />
          </div>

        </div>
      </main>
    </div>
  );
}
