import { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import type { ProjectEntry } from "../types";
import { makeStyles, RADIUS, type, useTheme } from "../theme";
import { Button, Header, Hint, Icon, Input } from "./ui";

interface Props {
  visible: boolean;
  projects: ProjectEntry[];
  activeId: string | null;
  /** Picked an existing project, or created one (`created` is then the new entry, not yet synced). */
  onPick: (id: string, created: ProjectEntry | null) => void;
  /** null = the user must pick one (first launch); the sheet cannot be dismissed. */
  onClose: (() => void) | null;
}

/** Which project the phone works on. Every capture goes there; remembered until changed. */
export function ProjectSheet({ visible, projects, activeId, onPick, onClose }: Props) {
  const s = useStyles();
  const { c } = useTheme();
  const [name, setName] = useState("");
  const trimmed = name.trim();
  const clash = projects.find((p) => p.name.trim().toLowerCase() === trimmed.toLowerCase());

  const create = () => {
    if (!trimmed) return;
    if (clash) { onPick(clash.id, null); setName(""); return; }
    const p: ProjectEntry = { id: Crypto.randomUUID(), name: trimmed, createdAt: new Date().toISOString(), synced: false };
    onPick(p.id, p);
    setName("");
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={() => onClose?.()}>
      <View style={s.root}>
        <Header title={onClose ? "Switch project" : "Which project are you working on?"} right={onClose ? <Pressable onPress={onClose} style={s.cancel} accessibilityRole="button"><Text style={s.cancelText}>Cancel</Text></Pressable> : undefined} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Hint>Every shot you take goes into the active project. The choice is remembered until you change it in Setup.</Hint>
          <View style={s.list}>
            {projects.map((p) => (
              <Pressable key={p.id} onPress={() => onPick(p.id, null)} style={({ pressed }) => [s.item, pressed && { backgroundColor: c.surfaceSunken }, p.id === activeId && s.itemActive]} accessibilityState={{ selected: p.id === activeId }}>
                <Icon name="folder-outline" />
                <View style={{ flex: 1 }}>
                  <Text style={[s.itemName, p.id === activeId && s.itemNameActive]}>{p.name}</Text>
                  {!p.synced && <Text style={s.itemSub}>Not synced yet</Text>}
                </View>
                {p.id === activeId && <Icon name="check" />}
              </Pressable>
            ))}
            {projects.length === 0 && <View style={{ padding: 14 }}><Hint>No projects yet. Create the first one below.</Hint></View>}
          </View>
          <Text style={s.label}>New project</Text>
          <Input value={name} onChangeText={setName} placeholder="Project name" autoCapitalize="sentences" onSubmitEditing={create} maxLength={80} />
          {!!clash && <Hint>“{clash.name}” already exists; this opens it.</Hint>}
          <Button label={clash ? "Open" : "Create and open"} icon={clash ? "folder-outline" : "plus"} onPress={create} disabled={!trimmed} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  cancel: { minHeight: 48, justifyContent: "center", paddingHorizontal: 10 },
  cancelText: { ...type("body", "bold"), color: c.accent },
  list: { marginTop: 12, marginBottom: 20, borderWidth: 2, borderColor: c.border, borderRadius: RADIUS.sm, overflow: "hidden", backgroundColor: c.surface },
  item: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 60, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: c.borderSubtle },
  itemActive: { backgroundColor: c.accentTint, borderLeftWidth: 4, borderLeftColor: c.accent },
  itemName: { ...type("body", "semibold"), color: c.text },
  itemNameActive: { fontFamily: type("body", "heavy").fontFamily },
  itemSub: { ...type("caption"), color: c.textDim },
  label: { ...type("overline", "bold"), color: c.text, marginBottom: 8 },
}));
