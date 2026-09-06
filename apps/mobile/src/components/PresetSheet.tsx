import { useState } from "react";
import { Alert, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { SENSOR_PRESETS, SPEEDBOOSTER_PRESETS } from "@fielder/fov-math";
import { api } from "../api";
import type { Preset } from "../types";
import { Button, Chip, ChipRow, colors, Hint, Input, Row, Sheet } from "./ui";

interface Props {
  visible: boolean;
  onClose: () => void;
  presets: Preset[];
  activeId: string | null;
  onChange: (presets: Preset[], activeId: string | null) => void;
}

const num = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };

export function PresetSheet({ visible, onClose, presets, activeId, onChange }: Props) {
  const [editing, setEditing] = useState<Preset | null>(null);
  const [name, setName] = useState("");
  const [w, setW] = useState("");
  const [h, setH] = useState("");
  const [sb, setSb] = useState("1");

  function startNew() {
    setEditing({ id: Crypto.randomUUID(), name: "", sensorWidthMm: 0, sensorHeightMm: 0, speedboosterFactor: 1, createdAt: new Date().toISOString(), synced: false });
    setName(""); setW(""); setH(""); setSb("1");
  }
  function startEdit(p: Preset) {
    setEditing(p); setName(p.name); setW(String(p.sensorWidthMm)); setH(String(p.sensorHeightMm)); setSb(String(p.speedboosterFactor));
  }

  async function save() {
    if (!editing) return;
    const width = num(w), height = num(h), factor = num(sb);
    if (!name.trim() || !width || !height || !factor) { Alert.alert("Incomplete", "Name, sensor width/height and speedbooster factor are required."); return; }
    const p: Preset = { ...editing, name: name.trim(), sensorWidthMm: width, sensorHeightMm: height, speedboosterFactor: factor, synced: false };
    let next = presets.some((x) => x.id === p.id) ? presets.map((x) => (x.id === p.id ? p : x)) : [...presets, p];
    onChange(next, p.id);
    setEditing(null);
    try {
      await api.putPreset(p);
      next = next.map((x) => (x.id === p.id ? { ...x, synced: true } : x));
      onChange(next, p.id);
    } catch (err) {
      // Stays local with synced=false; the viewfinder retries syncing on launch.
      console.warn("preset sync failed", err);
    }
  }

  function confirmDelete(p: Preset) {
    Alert.alert("Delete preset", `Delete "${p.name}"? Shots already taken keep their framing snapshot.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const next = presets.filter((x) => x.id !== p.id);
        onChange(next, activeId === p.id ? (next[0]?.id ?? null) : activeId);
        setEditing(null);
        try { await api.deletePreset(p.id); } catch (err) { console.warn("preset delete failed", err); }
      } },
    ]);
  }

  return (
    <Sheet visible={visible} title={editing ? (presets.some((x) => x.id === editing.id) ? "Edit rig" : "New rig") : "Rig presets"} onClose={editing ? () => setEditing(null) : onClose}>
      {!editing ? (
        <>
          <Row label="Saved rigs">
            {presets.length === 0 && <Hint>No rigs yet. A rig is a sensor plus an optional speedbooster, e.g. "Pocket 4K + Metabones 0.64".</Hint>}
            <ChipRow>
              {presets.map((p) => (
                <Chip key={p.id} label={`${p.name}${p.synced ? "" : " •"}`} selected={p.id === activeId} onPress={() => onChange(presets, p.id)} />
              ))}
            </ChipRow>
            {presets.some((p) => !p.synced) && <Hint>• = not yet synced to the server</Hint>}
          </Row>
          {activeId && presets.find((p) => p.id === activeId) && (
            <Row label="Active rig">
              {(() => { const p = presets.find((x) => x.id === activeId)!; return (
                <View>
                  <Text style={{ color: colors.text, fontSize: 15 }}>{p.name}</Text>
                  <Text style={{ color: colors.dim, marginTop: 2 }}>{p.sensorWidthMm} × {p.sensorHeightMm} mm · speedbooster ×{p.speedboosterFactor}</Text>
                  <Button label="Edit" kind="ghost" onPress={() => startEdit(p)} />
                </View>
              ); })()}
            </Row>
          )}
          <Button label="New rig" onPress={startNew} />
        </>
      ) : (
        <>
          <Row label="Name"><Input value={name} onChangeText={setName} placeholder="Pocket 4K + Metabones 0.64" autoFocus /></Row>
          <Row label="Sensor">
            <ChipRow>
              {SENSOR_PRESETS.map((s) => (
                <Chip key={s.id} label={s.name} selected={num(w) === s.widthMm && num(h) === s.heightMm} onPress={() => { setW(String(s.widthMm)); setH(String(s.heightMm)); }} />
              ))}
            </ChipRow>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Input value={w} onChangeText={setW} placeholder="width mm" keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Input value={h} onChangeText={setH} placeholder="height mm" keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <Hint>Use the active sensor area for your recording mode, not the full chip, e.g. Pocket 4K in 4K DCI is 18.96 × 10 mm.</Hint>
          </Row>
          <Row label="Speedbooster factor">
            <ChipRow>
              {SPEEDBOOSTER_PRESETS.map((f) => (
                <Chip key={f} label={f === 1 ? "none" : `×${f}`} selected={num(sb) === f} onPress={() => setSb(String(f))} />
              ))}
            </ChipRow>
            <Input value={sb} onChangeText={setSb} placeholder="custom, e.g. 0.71" keyboardType="decimal-pad" style={{ marginTop: 10 }} />
          </Row>
          <Button label="Save rig" onPress={save} />
          {presets.some((x) => x.id === editing.id) && <Button label="Delete rig" kind="danger" onPress={() => confirmDelete(editing)} />}
        </>
      )}
    </Sheet>
  );
}
