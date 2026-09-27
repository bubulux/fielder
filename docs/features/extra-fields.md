# Extra fields

Project-specific details of a shot (nearest U-Bahn station, access notes, parking…), defined by the user as JSON so an AI can write them.

## Definition format (`packages/vocab/src/fields.ts`)

```json
{ "key": "ubahn", "label": "U-Bahn", "type": "group", "fields": [
    { "key": "line", "label": "Line", "type": "select", "options": ["U1", "U4"] },
    { "key": "station", "label": "Station", "type": "select",
      "optionsBy": { "field": "line", "options": { "U1": ["Kurfürstendamm"], "U4": ["Nollendorfplatz", "Bayerischer Platz"] } } } ] }
```

- Types: `text`, `number`, `boolean`, `select`, `group`. Optional `help`.
- `select` takes either `options` (a fixed list) or `optionsBy` (options that depend on a sibling field in the same group, i.e. a cascading select). `multiple: true` stores an array.
- `group` holds `fields` and nests up to 4 levels. Keys are `[a-z][a-z0-9_]{0,39}` and unique within their level.
- `validateFieldDef` returns an error with a path, e.g. `ubahn.station: optionsBy.field "x" is not a sibling field`.
- `FIELD_PROMPT` is the text of the dashboard's "Copy prompt for AI" button. It explains this format to a model.

## Values on a shot

`shots.extra` is keyed by the top-level field key; a group is a nested object: `{ "ubahn": { "line": "U4", "station": "Nollendorfplatz" } }`.

- `validateValues(defs, extra)` does a strict check: only fields of the project, right types, options that are valid for the sibling's value. It is used by `PATCH /api/shots/:id`.
- Uploads only run `pruneExtra` (drop empty values and groups), so a phone with stale definitions never gets a capture rejected.
- `extraSummary(defs, extra)` gives display text ("U-Bahn › Line: U4 · …"); `extraLabel` is the fallback without definitions.
- Changing the parent select clears a dependent value that no longer fits (both editors).

## Storage and API

- Definitions are global (`field_definitions`, one row per top-level field). A project picks and orders the ones it uses (`project_fields`), via the Projects tab → Edit.
- `POST /api/fields/import` takes an array: new keys are created, existing keys replaced, everything validated before anything is written.
- Deleting a definition keeps the stored values on shots; they are just no longer shown or edited.

## UI

- **Dashboard Fields tab** (`Fields.tsx`): list with the projects using each field, New field (from text/select/group templates), a JSON editor with a live form preview (`ExtraEditor.tsx`), Import JSON, Copy all as JSON, Copy prompt for AI.
- **Tag forms**: dashboard `ExtraEditor.tsx` (combobox selects), phone `components/ExtraEditor.tsx` (chips, with a search list above 12 options). They render the fields of the shot's project.
- **Phone offline**: definitions and each project's `fieldIds` are cached during `flush()`. `store.fieldsForProject(projectId)` reads them.
- **Filters**: `extraFilterFields(defs)` turns every leaf into a filter field `extra.<path>` (select → enum/set, boolean → yes/no, number, text). The Views builder shows them under "Extra fields" (the active project's fields, or all of them for "All projects").
