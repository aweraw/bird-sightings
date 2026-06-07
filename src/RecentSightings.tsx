import { useEffect } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

export default function RecentSightings() {
  const sightings = useQuery(api.sightings.listRecent, { limit: 50 });
  const logView = useMutation(api.events.logView);

  // A query can't record its own view (queries are read-only), so log it here.
  useEffect(() => {
    void logView({ metadata: { view: 'recentSightings' } });
  }, [logView]);

  if (sightings === undefined) {
    return <p className="text-slate-500">Loading sightings…</p>;
  }

  if (sightings.length === 0) {
    return <p className="text-slate-500">No sightings yet — record the first one above.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="border-b-2 border-slate-300 dark:border-slate-700">
            <th className="py-2 pr-4 font-bold">Date</th>
            <th className="py-2 pr-4 font-bold">Species</th>
            <th className="py-2 pr-4 font-bold">Location</th>
            <th className="py-2 font-bold">Observer</th>
          </tr>
        </thead>
        <tbody>
          {sightings.map((s) => (
            <tr
              key={s._id}
              className="border-b border-slate-200 dark:border-slate-800 align-top"
            >
              <td className="py-2 pr-4 whitespace-nowrap">{s.date}</td>
              <td className="py-2 pr-4">
                {s.species.length > 0 ? s.species.map((sp) => sp.name).join(', ') : '—'}
              </td>
              <td className="py-2 pr-4">{s.location?.name ?? '—'}</td>
              <td className="py-2">{s.observer?.name ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
