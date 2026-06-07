import { useState } from 'react';
import { useMutation } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';
import { LocationPicker, SpeciesPicker, btn, field } from './pickers';

export default function SightingForm() {
  const createSighting = useMutation(api.sightings.create);

  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [locationId, setLocationId] = useState<Id<'locations'> | ''>('');
  const [selectedSpecies, setSelectedSpecies] = useState<Set<Id<'species'>>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const toggleSpecies = (id: Id<'species'>) => {
    setSelectedSpecies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!locationId) {
      setError('Choose a location.');
      return;
    }
    if (selectedSpecies.size === 0) {
      setError('Select at least one species.');
      return;
    }
    setSaving(true);
    try {
      await createSighting({
        locationId,
        date,
        speciesIds: [...selectedSpecies],
      });
      setSelectedSpecies(new Set()); // keep date & location for quick repeat entry
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sighting.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-4 p-4 rounded-md border-2 border-slate-200 dark:border-slate-800"
    >
      <h2 className="text-xl font-bold">Record a sighting</h2>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-bold" htmlFor="sighting-date">
          Date
        </label>
        <input
          id="sighting-date"
          type="date"
          className={field}
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      <LocationPicker value={locationId} onChange={setLocationId} />
      <SpeciesPicker selected={selectedSpecies} onToggle={toggleSpecies} />

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div>
        <button type="submit" className={btn} disabled={saving}>
          {saving ? 'Saving…' : 'Record sighting'}
        </button>
      </div>
    </form>
  );
}
