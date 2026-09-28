import { useState } from "react";
import { Alert, Text, View } from "react-native";
import * as Crypto from "expo-crypto";
import { CAMERAS, CUSTOM_CAMERA_ID, describeRig, findFormat, SPEEDBOOSTER_PRESETS } from "@fielder/fov-math";
import { api } from "../api";
import type { Preset } from "../types";
import { type, useTheme } from "../theme";
import { Button, Chip, ChipRow, Hint, Input, Row, Sheet } from "./ui";

interface Props {
  visible: boolean;
  onClose: () => void;
  presets: Preset[];
  activeId: string | null;
  onChange: (presets: Preset[], activeId: string | null) => void;
}

const num = (s: string) => { const v = Number(s.replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };

interface Draft {
  id: string;
  isNew: boolean;
  name: string;
  cameraId: string; // CUSTOM_CAMERA_ID for manual dimensions
  formatId: string | null;
  w: string;
  h: string;
  sb: string;
  lmin: string;
  lmax: string;
}

export function PresetSheet({ visible, onClose, presets, activeId, onChange }: Props) {
  const { c } = useTheme();
  const [d, setD] = useState<Draft | null>(null);
  const patch = (x: Partial<Draft>) => setD((cur) => (cur ? { ...cur, ...x } : cur));

  function startNew() {
    setD({ id: Crypto.randomUUID(), isNew: true, name: "", cameraId: CAMERAS[0].id, formatId: null, w: "", h: "", sb: "1", lmin: "", lmax: "" });
  }
  function startEdit(p: Preset) {
    setD({
      id: p.id, isNew: false, name: p.name,
      cameraId: p.cameraId && findFormat(p.cameraId, p.formatId) ? p.cameraId : CUSTOM_CAMERA_ID,
      formatId: p.formatId, w: String(p.sensorWidthMm), h: String(p.sensorHeightMm), sb: String(p.speedboosterFactor),
      lmin: p.lensMinMm == null ? "" : String(p.lensMinMm), lmax: p.lensMaxMm == null ? "" : String(p.lensMaxMm),
    });
  }

  function pickCamera(cameraId: string) {
    const cam = CAMERAS.find((c) => c.id === cameraId);
    const f = cam?.formats[0];
    patch({ cameraId, formatId: f?.id ?? null, w: f ? String(f.widthMm) : "", h: f ? String(f.heightMm) : "" });
  }
  function pickFormat(formatId: string) {
    if (!d) return;
    const f = findFormat(d.cameraId, formatId);
    if (f) patch({ formatId, w: String(f.widthMm), h: String(f.heightMm) });
  }

  function autoName(x: Draft): string {
    const cam = CAMERAS.find((c) => c.id === x.cameraId);
    const f = findFormat(x.cameraId, x.formatId);
    const base = cam && f ? `${cam.name.replace("Blackmagic ", "")} ${f.name.split(" ")[0]}` : "Custom";
    const sb = num(x.sb);
    return sb && sb !== 1 ? `${base} + ×${sb}` : base;
  }

  async function save() {
    if (!d) return;
    const width = num(d.w), height = num(d.h), factor = num(d.sb);
    if (!width || !height || !factor) { Alert.alert("Incomplete", "Sensor width/height and speedbooster factor are required."); return; }
    const lmin = d.lmin.trim() ? num(d.lmin) : null, lmax = d.lmax.trim() ? num(d.lmax) : null;
    if ((lmin === null) !== (lmax === null) || (d.lmin.trim() && !lmin) || (d.lmax.trim() && !lmax)) { Alert.alert("Lens range", "Enter both the shortest and the longest focal length, or leave both empty."); return; }
    if (lmin !== null && lmax !== null && lmin >= lmax) { Alert.alert("Lens range", "The shortest focal length must be smaller than the longest."); return; }
    const isCustom = d.cameraId === CUSTOM_CAMERA_ID;
    const p: Preset = {
      id: d.id,
      name: d.name.trim() || autoName(d),
      cameraId: isCustom ? null : d.cameraId,
      formatId: isCustom ? null : d.formatId,
      sensorWidthMm: width, sensorHeightMm: height, speedboosterFactor: factor,
      lensMinMm: lmin, lensMaxMm: lmax,
      createdAt: presets.find((x) => x.id === d.id)?.createdAt ?? new Date().toISOString(),
      synced: false,
    };
    let next = presets.some((x) => x.id === p.id) ? presets.map((x) => (x.id === p.id ? p : x)) : [...presets, p];
    onChange(next, p.id);
    setD(null);
    try {
      await api.putPreset(p);
      next = next.map((x) => (x.id === p.id ? { ...x, synced: true } : x));
      onChange(next, p.id);
    } catch (err) {
      console.warn("preset sync failed; will retry on next launch", err);
    }
  }

  function confirmDelete(id: string) {
    const p = presets.find((x) => x.id === id);
    if (!p) return;
    Alert.alert("Delete rig", `Delete "${p.name}" on this phone and on the server? Shots already taken keep their framing snapshot.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: async () => {
        const next = presets.filter((x) => x.id !== id);
        onChange(next, activeId === id ? (next[0]?.id ?? null) : activeId);
        setD(null);
        try { await api.deletePreset(id); } catch (err) { console.warn("preset delete failed", err); }
      } },
    ]);
  }

  const active = presets.find((p) => p.id === activeId);
  const cam = d ? CAMERAS.find((c) => c.id === d.cameraId) : undefined;

  return (
    <Sheet visible={visible} title={d ? (d.isNew ? "New rig" : "Edit rig") : "Rigs"} onClose={d ? () => setD(null) : onClose}>
      {!d ? (
        <>
          <Row label="Saved rigs (stored on the server)">
            {presets.length === 0 && <Hint>No rigs yet. A rig is a camera body in a recording format, plus an optional speedbooster.</Hint>}
            <ChipRow>
              {presets.map((p) => (
                <Chip key={p.id} icon={p.synced ? undefined : "cloud-off-outline"} label={p.name} selected={p.id === activeId} onPress={() => onChange(presets, p.id)} />
              ))}
            </ChipRow>
            {presets.some((p) => !p.synced) && <Hint>Cloud-off icon: not synced to the server yet.</Hint>}
          </Row>
          {active && (
            <Row label="Active rig">
              <Text style={{ ...type("body", "bold"), color: c.text }}>{active.name}</Text>
              <Text style={{ ...type("small"), color: c.textDim }}>{describeRig(active.cameraId, active.formatId, active.sensorWidthMm, active.sensorHeightMm)}</Text>
              <Text style={{ ...type("small"), color: c.textDim }}>{active.sensorWidthMm} × {active.sensorHeightMm} mm · speedbooster {active.speedboosterFactor === 1 ? "none" : `×${active.speedboosterFactor}`}</Text>
              <Text style={{ ...type("small"), color: c.textDim }}>Lens {active.lensMinMm != null && active.lensMaxMm != null ? `${active.lensMinMm}–${active.lensMaxMm} mm` : "any focal length"}</Text>
              <Button label="Edit rig" icon="pencil-outline" kind="ghost" onPress={() => startEdit(active)} />
            </Row>
          )}
          <Button label="New rig" icon="plus" onPress={startNew} />
        </>
      ) : (
        <>
          <Row label="Camera body">
            <ChipRow>
              {CAMERAS.map((c) => <Chip key={c.id} label={c.name} selected={d.cameraId === c.id} onPress={() => pickCamera(c.id)} />)}
              <Chip label="Custom sensor" selected={d.cameraId === CUSTOM_CAMERA_ID} onPress={() => patch({ cameraId: CUSTOM_CAMERA_ID, formatId: null })} />
            </ChipRow>
          </Row>
          {cam ? (
            <Row label="Recording format (defines the active sensor area)">
              <ChipRow>
                {cam.formats.map((f) => <Chip key={f.id} label={f.name} selected={d.formatId === f.id} onPress={() => pickFormat(f.id)} />)}
              </ChipRow>
              {d.formatId && <Hint>{d.w} × {d.h} mm{findFormat(d.cameraId, d.formatId)?.windowed ? " · windowed crop of the sensor" : ""}</Hint>}
            </Row>
          ) : (
            <Row label="Active sensor area">
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Input value={d.w} onChangeText={(w) => patch({ w })} placeholder="width mm" keyboardType="decimal-pad" style={{ flex: 1 }} />
                <Input value={d.h} onChangeText={(h) => patch({ h })} placeholder="height mm" keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>
              <Hint>Use the area used by your recording mode, from the camera's spec sheet.</Hint>
            </Row>
          )}
          <Row label="Speedbooster / focal reducer">
            <ChipRow>
              {SPEEDBOOSTER_PRESETS.map((f) => (
                <Chip key={f} label={f === 1 ? "none" : `×${f}`} selected={num(d.sb) === f} onPress={() => patch({ sb: String(f) })} />
              ))}
            </ChipRow>
            <Input value={d.sb} onChangeText={(sb) => patch({ sb })} placeholder="custom factor, e.g. 0.71" keyboardType="decimal-pad" style={{ marginTop: 10 }} />
          </Row>
          <Row label="Lens range (optional)">
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Input value={d.lmin} onChangeText={(lmin) => patch({ lmin })} placeholder="shortest mm" keyboardType="decimal-pad" style={{ flex: 1 }} />
              <Input value={d.lmax} onChangeText={(lmax) => patch({ lmax })} placeholder="longest mm" keyboardType="decimal-pad" style={{ flex: 1 }} />
            </View>
            <Hint>e.g. 18 / 35 for a Sigma 18-35. The lens stepper and custom entry then stay inside this range. Leave empty for any lens.</Hint>
          </Row>
          <Row label="Name (optional)">
            <Input value={d.name} onChangeText={(name) => patch({ name })} placeholder={autoName(d)} />
          </Row>
          <Button label="Save rig" icon="check" onPress={save} />
          {!d.isNew && <Button label="Delete rig" icon="delete-outline" kind="danger" onPress={() => confirmDelete(d.id)} />}
        </>
      )}
    </Sheet>
  );
}
