import { useEffect, useState } from "react";
import { View } from "react-native";
import { pruneExtra } from "@fielder/vocab";
import { api, type Shot } from "../api";
import { useApp } from "../appState";
import { ensureLocation } from "../namedSync";
import { store } from "../storage";
import { Banner, Button, Sheet, toast } from "../ui";
import { TagEditor, type TagDraft } from "./TagEditor";

const draftOf = (s: Shot): TagDraft => ({
  tags: { name: s.name, light: s.light, artificial: s.artificial, weather: s.weather, int_ext: s.int_ext, location_id: s.location_id, extra: s.extra ?? {} },
  newLocation: null,
});

/**
 * Edit a stored shot's tags: the same TagEditor as after a capture, in a 92 % sheet with Save
 * pinned. PATCH /api/shots/:id; a failure keeps the sheet open with the error on top.
 */
export function EditTagsSheet({ shot, visible, onClose }: { shot: Shot; visible: boolean; onClose: () => void }) {
  const app = useApp();
  const [draft, setDraft] = useState<TagDraft>(() => draftOf(shot));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (visible) { setDraft(draftOf(shot)); setError(null); } }, [visible, shot.id]);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      let tags = { ...draft.tags, name: draft.tags.name?.trim() || null, extra: pruneExtra(draft.tags.extra) };
      const nl = draft.newLocation;
      if (nl) {
        const id = await ensureLocation(nl);
        app.setLocations([...app.locations.filter((l) => l.id !== nl.id && l.id !== id), { ...nl, id, synced: true }]);
        tags = { ...tags, location_id: id };
      }
      app.shots.update(await api.patchShot(shot.id, tags));
      toast("Saved");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };

  return (
    <Sheet visible={visible} title="Edit details" onClose={onClose} height={0.92} leadLabel="Cancel" doneLabel={null}
      footer={<Button icon="check" label="Save" onPress={() => void save()} busy={busy} />}>
      <View style={{ marginHorizontal: -20, marginTop: -12 }}>
        {error && <View style={{ padding: 12 }}><Banner kind="danger" title="Not saved" meta={`${error}. Your edits are still here.`} /></View>}
        <TagEditor value={draft} onChange={setDraft} locations={app.locations} countAt={app.countAt}
          fields={store.fieldsForProject(shot.project_id)} projectName={app.projects.find((p) => p.id === shot.project_id)?.name} />
      </View>
    </Sheet>
  );
}
