import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { Id } from '../convex/_generated/dataModel';

export const btn =
  'bg-dark dark:bg-light text-light dark:text-dark text-sm px-3 py-1.5 rounded-md border-2 disabled:opacity-50';
export const btnGhost =
  'text-sm px-3 py-1.5 rounded-md border-2 border-slate-300 dark:border-slate-700';
export const field =
  'border-2 border-slate-300 dark:border-slate-700 rounded-md px-2 py-1 bg-transparent';

type EntityData = { name: string; description: string };

/**
 * Inline add/edit form for a species or location. Uses buttons (not a nested
 * <form>) since it may live inside another <form> — nested forms are invalid.
 */
function EntityEditor({
  title,
  initial,
  onSave,
  onCancel,
}: {
  title: string;
  initial?: EntityData;
  onSave: (data: EntityData) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), description: description.trim() });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2 mt-2 p-3 rounded-md border-2 border-slate-200 dark:border-slate-800">
      <p className="text-sm font-bold">{title}</p>
      <input
        className={field}
        placeholder="Name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        autoFocus
      />
      <input
        className={field}
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="flex gap-2">
        <button type="button" className={btn} disabled={!name.trim() || busy} onClick={save}>
          Save
        </button>
        <button type="button" className={btnGhost} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function LocationPicker({
  value,
  onChange,
}: {
  value: Id<'locations'> | '';
  onChange: (id: Id<'locations'> | '') => void;
}) {
  const locations = useQuery(api.locations.list) ?? [];
  const createLocation = useMutation(api.locations.create);
  const updateLocation = useMutation(api.locations.update);
  const [mode, setMode] = useState<null | 'add' | 'edit'>(null);

  const selected = locations.find((l) => l._id === value);

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-bold">Location</label>
      <div className="flex gap-2 items-center flex-wrap">
        <select
          className={field}
          value={value}
          onChange={(e) => onChange(e.target.value as Id<'locations'> | '')}
        >
          <option value="">Select a location…</option>
          {locations.map((l) => (
            <option key={l._id} value={l._id}>
              {l.name}
            </option>
          ))}
        </select>
        <button type="button" className={btnGhost} onClick={() => setMode('add')}>
          + Add
        </button>
        {selected && (
          <button type="button" className={btnGhost} onClick={() => setMode('edit')}>
            Edit
          </button>
        )}
      </div>
      {mode === 'add' && (
        <EntityEditor
          title="New location"
          onCancel={() => setMode(null)}
          onSave={async (data) => {
            const id = await createLocation(data);
            onChange(id);
            setMode(null);
          }}
        />
      )}
      {mode === 'edit' && selected && (
        <EntityEditor
          title="Edit location"
          initial={{ name: selected.name, description: selected.description }}
          onCancel={() => setMode(null)}
          onSave={async (data) => {
            await updateLocation({ id: selected._id, ...data });
            setMode(null);
          }}
        />
      )}
    </div>
  );
}

export function SpeciesPicker({
  selected,
  onToggle,
}: {
  selected: Set<Id<'species'>>;
  onToggle: (id: Id<'species'>) => void;
}) {
  const species = useQuery(api.species.list) ?? [];
  const createSpecies = useMutation(api.species.create);
  const updateSpecies = useMutation(api.species.update);
  const [mode, setMode] = useState<null | 'add' | { editId: Id<'species'> }>(null);

  const editing = mode && mode !== 'add' ? species.find((s) => s._id === mode.editId) : undefined;

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-bold">Species (one or more)</label>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto p-2 rounded-md border-2 border-slate-300 dark:border-slate-700">
        {species.length === 0 && (
          <p className="text-sm text-slate-500">No species yet — add one below.</p>
        )}
        {species.map((s) => (
          <div key={s._id} className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={selected.has(s._id)}
                onChange={() => onToggle(s._id)}
              />
              {s.name}
            </label>
            <button
              type="button"
              className="text-xs underline text-slate-500"
              onClick={() => setMode({ editId: s._id })}
            >
              edit
            </button>
          </div>
        ))}
      </div>
      <div>
        <button type="button" className={btnGhost} onClick={() => setMode('add')}>
          + Add species
        </button>
      </div>
      {mode === 'add' && (
        <EntityEditor
          title="New species"
          onCancel={() => setMode(null)}
          onSave={async (data) => {
            const id = await createSpecies(data);
            onToggle(id); // auto-select the new species
            setMode(null);
          }}
        />
      )}
      {editing && (
        <EntityEditor
          title="Edit species"
          initial={{ name: editing.name, description: editing.description }}
          onCancel={() => setMode(null)}
          onSave={async (data) => {
            await updateSpecies({ id: editing._id, ...data });
            setMode(null);
          }}
        />
      )}
    </div>
  );
}
