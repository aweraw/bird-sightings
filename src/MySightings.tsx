import { useState } from 'react';
import { Authenticated, Unauthenticated, useMutation, useQuery } from 'convex/react';
import { Link } from 'react-router-dom';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { LocationPicker, SpeciesPicker, btn, btnGhost, field } from './pickers';

type MineItem = {
  _id: Id<'sighting'>;
  date: string;
  locationId: Id<'locations'>;
  locationName: string | null;
  species: { _id: Id<'species'>; name: string }[];
};

export default function MySightings() {
  return (
    <div className="flex flex-col gap-6 max-w-3xl w-full mx-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">My sightings</h2>
        <Link to="/" className="text-sm underline hover:no-underline">
          ← Back
        </Link>
      </div>
      <Authenticated>
        <MySightingsList />
      </Authenticated>
      <Unauthenticated>
        <p>Please sign in to manage your sightings.</p>
      </Unauthenticated>
    </div>
  );
}

function MySightingsList() {
  const sightings = useQuery(api.sightings.listMine);
  const [selectedId, setSelectedId] = useState<Id<'sighting'> | null>(null);

  if (sightings === undefined) {
    return <p className="text-slate-500">Loading…</p>;
  }
  if (sightings.length === 0) {
    return <p className="text-slate-500">You haven't recorded any sightings yet.</p>;
  }

  const selected = sightings.find((s) => s._id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-300 dark:border-slate-700">
              <th className="py-2 pr-4 font-bold">Date</th>
              <th className="py-2 pr-4 font-bold">Species</th>
              <th className="py-2 font-bold">Location</th>
            </tr>
          </thead>
          <tbody>
            {sightings.map((s) => {
              const isSelected = s._id === selectedId;
              return (
                <tr
                  key={s._id}
                  onClick={() => setSelectedId(isSelected ? null : s._id)}
                  className={`border-b border-slate-200 dark:border-slate-800 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                  }`}
                >
                  <td className="py-2 pr-4 whitespace-nowrap">{s.date}</td>
                  <td className="py-2 pr-4">
                    {s.species.length > 0 ? s.species.map((sp) => sp.name).join(', ') : '—'}
                  </td>
                  <td className="py-2">{s.locationName ?? '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selected && (
        <EditableSighting
          key={selected._id}
          sighting={selected}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function EditableSighting({ sighting, onClose }: { sighting: MineItem; onClose: () => void }) {
  const update = useMutation(api.sightings.update);
  const remove = useMutation(api.sightings.remove);

  const [date, setDate] = useState(sighting.date);
  const [locationId, setLocationId] = useState<Id<'locations'> | ''>(sighting.locationId);
  const [selected, setSelected] = useState<Set<Id<'species'>>>(
    new Set(sighting.species.map((s) => s._id)),
  );
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const toggleSpecies = (id: Id<'species'>) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    setStatus(null);
    if (!locationId) {
      setStatus('Choose a location.');
      return;
    }
    if (selected.size === 0) {
      setStatus('Select at least one species.');
      return;
    }
    setBusy(true);
    try {
      await update({ id: sighting._id, locationId, date, speciesIds: [...selected] });
      setStatus('Saved.');
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to save.');
    } finally {
      setBusy(false);
    }
  };

  const del = async () => {
    if (!window.confirm('Delete this sighting?')) return;
    setBusy(true);
    try {
      await remove({ id: sighting._id });
      onClose(); // row drops out of listMine; collapse the panel
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to delete.');
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 rounded-md border-2 border-slate-200 dark:border-slate-800">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold">Edit sighting</h3>
        <button type="button" className="text-sm underline hover:no-underline" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold">Date</label>
        <input
          type="date"
          className={field}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <LocationPicker value={locationId} onChange={setLocationId} />
      <SpeciesPicker selected={selected} onToggle={toggleSpecies} />

      {status && <p className="text-sm text-slate-500">{status}</p>}

      <div className="flex gap-2">
        <button type="button" className={btn} disabled={busy} onClick={save}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <button type="button" className={btnGhost} onClick={del} disabled={busy}>
          Delete
        </button>
      </div>
    </div>
  );
}
