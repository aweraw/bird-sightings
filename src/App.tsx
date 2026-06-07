import { useEffect } from 'react';
import { Authenticated, Unauthenticated, useConvexAuth, useMutation } from 'convex/react';
import { Routes, Route, Link } from 'react-router-dom';
import { useAuth } from '@workos-inc/authkit-react';
import { api } from '../convex/_generated/api';
import User from './user.tsx';
import SightingForm from './SightingForm.tsx';
import RecentSightings from './RecentSightings.tsx';
import MySightings from './MySightings.tsx';
import Dashboard from './Dashboard.tsx';

/**
 * Ensure the current user's row exists (and emit the login event) on any
 * authenticated route. Centralized here so it fires once per session
 * regardless of which page the user lands on first.
 */
function useEnsureUser() {
  const { isAuthenticated } = useConvexAuth();
  const setUser = useMutation(api.users.setUser);
  useEffect(() => {
    if (!isAuthenticated) return;
    void setUser();
  }, [isAuthenticated, setUser]);
}

export default function App() {
  useEnsureUser();
  return (
    <>
      <header className="sticky top-0 z-10 bg-light dark:bg-dark p-4 border-b-2 border-slate-200 dark:border-slate-800 flex flex-row justify-between items-center">
        <div className="flex items-center gap-4">
          <Link to="/" className="font-bold">
            Bird Sightings App
          </Link>
          <Authenticated>
            <nav className="flex gap-3 text-sm">
              <Link to="/my-sightings" className="underline hover:no-underline">
                My sightings
              </Link>
              <Link to="/dashboard" className="underline hover:no-underline">
                Dashboard
              </Link>
            </nav>
          </Authenticated>
        </div>
        <AuthButton />
      </header>
      <main className="p-8 flex flex-col gap-16">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/my-sightings" element={<MySightings />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="*" element={<Home />} />
        </Routes>
      </main>
    </>
  );
}

function AuthButton() {
  const { user, signIn, signOut } = useAuth();

  if (user) {
    return (
      <button
        onClick={() => signOut()}
        className="bg-dark dark:bg-light text-light dark:text-dark text-sm px-4 py-2 rounded-md border-2"
      >
        Sign out
      </button>
    );
  }

  return (
    <button
      onClick={() => void signIn()}
      className="bg-dark dark:bg-light text-light dark:text-dark text-sm px-4 py-2 rounded-md border-2"
    >
      Sign in
    </button>
  );
}

function Home() {
  return (
    <div className="flex flex-col gap-8 max-w-3xl w-full mx-auto">
      <User />
      <Authenticated>
        <SightingForm />
      </Authenticated>
      <Unauthenticated>
        <p>Please sign in to create a new sighting.</p>
      </Unauthenticated>
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Recent sightings</h2>
        <RecentSightings />
      </section>
    </div>
  );
}
