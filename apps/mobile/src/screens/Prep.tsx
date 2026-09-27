import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { cover, type Shot } from "../api";
import { FRAME_MODES, frameModeLabel, imageAspect, frameOf, ShotFrame, type FrameMode } from "../components/ShotFrame";
import { Chip, ChipRow, colors, Sheet } from "../components/ui";
import type { Settings } from "../types";
import { placeLabel, rigLabel, shotTitle, tagsLabel, type useShots } from "./Gallery";

interface Props { settings: Settings; data: ReturnType<typeof useShots> }

const NAV = 88;
const fmt = (iso: string) => new Date(iso).toLocaleString();

/**
 * Prep mode: phone mounted on the camera, pick a location and step through its approved
 * shots one by one with big prev/next buttons. Only approved shots are shown.
 */
export function Prep({ settings, data }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const portrait = height >= width;
  const [locationId, setLocationId] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [mode, setMode] = useState<FrameMode>("fit");
  const [info, setInfo] = useState(false);
  const { shots, error } = data;

  // Locations that have at least one approved shot, from the shots themselves (the name is joined in).
  const groups = useMemo(() => {
    const m = new Map<string, { id: string; name: string; shots: Shot[] }>();
    for (const s of shots ?? []) {
      if (s.state !== "approved") continue;
      const id = s.location_id ?? "none";
      const g = m.get(id) ?? { id, name: s.location_name ?? "No location", shots: [] };
      g.shots.push(s);
      m.set(id, g);
    }
    for (const g of m.values()) g.shots.sort((a, b) => a.captured_at.localeCompare(b.captured_at));
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  }, [shots]);
  const group = groups.find((g) => g.id === locationId) ?? null;
  useEffect(() => { setIndex(0); }, [locationId]);
  useEffect(() => { if (group && index >= group.shots.length) setIndex(Math.max(0, group.shots.length - 1)); }, [group, index]);

  if (error) return <Text style={p.status}>Could not load: {error}</Text>;
  if (!shots) return <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />;

  if (!group) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <View style={p.bar}><Text style={p.barTitle}>Prep · pick a location</Text></View>
        <FlatList
          data={groups}
          keyExtractor={(g) => g.id}
          contentContainerStyle={{ padding: 12, gap: 8 }}
          ListEmptyComponent={<Text style={p.status}>No approved shots yet. Approve shots in the Review tab first.</Text>}
          renderItem={({ item }) => (
            <Pressable onPress={() => setLocationId(item.id)} style={p.locRow}>
              <View style={{ flex: 1 }}>
                <Text style={p.locName}>{item.name}</Text>
              </View>
              <Text style={p.locCount}>{item.shots.length} approved</Text>
            </Pressable>
          )}
        />
      </View>
    );
  }

  const shot = group.shots[index];
  const atStart = index === 0, atEnd = index === group.shots.length - 1;
  // Image uses the full available height; width follows from the photo/frame aspect.
  const barH = 44;
  const availW = portrait ? width - 24 : width - 2 * NAV - 24;
  const availH = portrait ? height - barH - NAV - 60 - insets.top : height - barH - 60;
  const photo = cover(shot);
  const f = frameOf(photo);
  const aspect = mode === "fit" && f ? imageAspect(photo) * (f.width / f.height) : imageAspect(photo);
  const imgW = Math.max(100, Math.min(availW, availH * aspect));

  const navBtn = (dir: -1 | 1) => {
    const disabled = dir < 0 ? atStart : atEnd;
    return (
      <Pressable onPress={() => setIndex((i) => i + dir)} disabled={disabled} style={[p.nav, portrait ? { flex: 1, height: NAV } : { width: NAV, alignSelf: "stretch" }, disabled && { opacity: 0.25 }]} hitSlop={8}>
        <Text style={p.navText}>{dir < 0 ? "◀" : "▶"}</Text>
      </Pressable>
    );
  };
  const image = (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ShotFrame photo={photo} width={imgW} settings={settings} mode={mode} />
      <View style={{ marginTop: 8 }}>
        <ChipRow>{FRAME_MODES.map((m) => <Chip key={m} label={frameModeLabel(m)} selected={mode === m} onPress={() => setMode(m)} />)}</ChipRow>
      </View>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[p.bar, { height: barH, flexDirection: "row", alignItems: "center", gap: 12 }]}>
        <Pressable onPress={() => setLocationId(null)} hitSlop={8}><Text style={{ color: colors.accent, fontSize: 15 }}>‹ Locations</Text></Pressable>
        <Text style={[p.barTitle, { flex: 1 }]} numberOfLines={1}>{group.name} · shot {index + 1} / {group.shots.length}</Text>
        <Pressable onPress={() => setInfo(true)} hitSlop={8} style={p.infoBtn}><Text style={p.infoText}>i</Text></Pressable>
      </View>
      {portrait ? (
        <>
          {image}
          <View style={{ flexDirection: "row" }}>{navBtn(-1)}{navBtn(1)}</View>
        </>
      ) : (
        <View style={{ flex: 1, flexDirection: "row" }}>{navBtn(-1)}{image}{navBtn(1)}</View>
      )}
      <Sheet visible={info} title={shotTitle(shot)} onClose={() => setInfo(false)}>
        <Text style={p.infoLine}>{placeLabel(shot) || "no location"}</Text>
        <Text style={p.infoDim}>{tagsLabel(shot) || "no tags"}</Text>
        <Text style={p.infoDim}>{rigLabel(photo)}</Text>
        <Text style={p.infoDim}>{fmt(shot.captured_at)}</Text>
        <Text style={p.infoDim}>{photo.lat.toFixed(5)}, {photo.lon.toFixed(5)}</Text>
      </Sheet>
    </View>
  );
}

const p = StyleSheet.create({
  bar: { paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  barTitle: { color: colors.text, fontSize: 16, fontWeight: "600" },
  status: { color: colors.dim, textAlign: "center", marginTop: 40, paddingHorizontal: 24 },
  locRow: { flexDirection: "row", alignItems: "center", backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 14, gap: 12 },
  locName: { color: colors.text, fontSize: 16, fontWeight: "600" },
  locSub: { color: colors.dim, fontSize: 12, marginTop: 2 },
  locCount: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  nav: { alignItems: "center", justifyContent: "center" },
  navText: { color: colors.text, fontSize: 40 },
  infoBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: colors.accent, alignItems: "center", justifyContent: "center" },
  infoText: { color: colors.accent, fontWeight: "700", fontStyle: "italic" },
  infoLine: { color: colors.text, fontSize: 15, marginTop: 8 },
  infoDim: { color: colors.dim, marginTop: 6 },
});
