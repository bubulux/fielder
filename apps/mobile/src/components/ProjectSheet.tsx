import { useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import type { ProjectEntry } from "../types";
import { Button, colors, Hint, Input } from "./ui";

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
        <View style={s.header}>
          <Text style={s.title}>{onClose ? "Switch project" : "Which project are you working on?"}</Text>
          {onClose && <Pressable onPress={onClose} hitSlop={12}><Text style={s.close}>Cancel</Text></Pressable>}
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          <Hint>Every shot you take goes into the active project. The choice is remembered until you change it in Setup.</Hint>
          <View style={s.list}>
            {projects.map((p) => (
              <Pressable key={p.id} onPress={() => onPick(p.id, null)} style={[s.item, p.id === activeId && s.itemActive]}>
                <Text style={[s.itemName, p.id === activeId && { color: colors.accent }]}>{p.name}</Text>
                {!p.synced && <Text style={s.itemSub}>not synced yet</Text>}
              </Pressable>
            ))}
            {projects.length === 0 && <Text style={[s.itemSub, { padding: 12 }]}>No projects yet. Create the first one below.</Text>}
          </View>
          <Text style={s.label}>New project</Text>
          <Input value={name} onChangeText={setName} placeholder="Project name" autoCapitalize="sentences" onSubmitEditing={create} maxLength={80} />
          {!!clash && <Hint>“{clash.name}” already exists; this opens it.</Hint>}
          <Button label={clash ? "Open" : "Create and open"} onPress={create} disabled={!trimmed} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: "600", flex: 1 },
  close: { color: colors.accent, fontSize: 16, fontWeight: "600" },
  list: { marginTop: 12, marginBottom: 20, borderWidth: 1, borderColor: colors.border, borderRadius: 8, overflow: "hidden" },
  item: { paddingHorizontal: 14, paddingVertical: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, backgroundColor: colors.panel },
  itemActive: { backgroundColor: "rgba(255,179,0,0.08)" },
  itemName: { color: colors.text, fontSize: 16 },
  itemSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
  label: { color: colors.dim, fontSize: 12, textTransform: "uppercase", letterSpacing: 0.6, marginBottom: 8 },
});
