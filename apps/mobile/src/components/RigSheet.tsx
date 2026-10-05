import { View } from "react-native";
import { pickRig, useRigs } from "../rigs";
import { rigMeta } from "../screens/Rigs";
import { Hint, ListRow, Sheet } from "../ui";

/** Shoot → Rig: pick the rig to shoot with (tap = use + close); editing and new rigs open the Rig editor. */
export function RigSheet({ visible, onClose, onEdit }: { visible: boolean; onClose: () => void; onEdit: (rigId: string | null) => void }) {
  const { rigs, active } = useRigs();
  return (
    <Sheet visible={visible} title="Rig" sub="Tap to shoot with it" onClose={onClose} height={0.72}>
      <View style={{ marginHorizontal: -20, marginTop: -12 }}>
        {rigs.map((p) => (
          <ListRow key={p.id} icon="camera-outline" title={p.name} meta={rigMeta(p)} selected={p.id === active?.id} trailing={null}
            onPress={() => { pickRig(p.id); onClose(); }} />
        ))}
        {rigs.length === 0 && <View style={{ padding: 20 }}><Hint>No rig yet. A rig is a camera body in a recording format, plus an optional speedbooster.</Hint></View>}
        {active && <ListRow icon="pencil-outline" title={`Edit ${active.name}`} onPress={() => { onClose(); onEdit(active.id); }} />}
        <ListRow icon="plus" title="New rig" onPress={() => { onClose(); onEdit(null); }} />
      </View>
    </Sheet>
  );
}
