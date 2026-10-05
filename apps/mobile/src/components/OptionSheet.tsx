import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { Button, Checkbox, Chip, ChipCell, ChipGrid, ChipRow, Hint, Icon, makeStyles, Sheet, SheetSearch, type, useTheme } from "../ui";

export interface Option { id: string; label: string; meta?: string; icon?: string }

/** Up to this many options show as a chip grid; more get a search list. */
export const CHIP_LIMIT = 12;

/** Prefix matches first, then contains. */
export function rankMatches<T>(items: readonly T[], query: string, text: (t: T) => string): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  const starts = items.filter((i) => text(i).toLowerCase().startsWith(q));
  const contains = items.filter((i) => !text(i).toLowerCase().startsWith(q) && text(i).toLowerCase().includes(q));
  return [...starts, ...contains];
}

interface Props {
  visible: boolean;
  title: string;
  sub?: string;
  options: readonly Option[];
  /** Selected ids (one for a single choice). */
  value: readonly string[];
  multiple?: boolean;
  /** Single choice: tap = pick + close; tapping the selected one again clears it. Multiple: Done (n) applies. */
  onChange: (ids: string[]) => void;
  onClose: () => void;
  /** Force the search list even for few options (e.g. camera bodies with meta lines). */
  list?: boolean;
  /** 2-column chip grid (weather). */
  columns?: 2;
  emptyText?: string;
}

/** A focused choice: chips for a few options, a searchable list for many, checkboxes when several are allowed. */
export function OptionSheet({ visible, title, sub, options, value, multiple, onChange, onClose, list, columns, emptyText }: Props) {
  const s = useStyles();
  const { c } = useTheme();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([...value]);
  useEffect(() => { if (visible) { setPicked([...value]); setQ(""); } }, [visible]);
  const asList = list || options.length > CHIP_LIMIT;
  const shown = useMemo(() => rankMatches(options, q, (o) => o.label), [options, q]);

  const tap = (id: string) => {
    if (multiple) { setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id])); return; }
    onChange(value.includes(id) ? [] : [id]);
    onClose();
  };
  const footer = multiple ? <Button icon="check" label={`Done (${picked.length})`} onPress={() => { onChange(picked); onClose(); }} /> : undefined;
  const isOn = (id: string) => (multiple ? picked : value).includes(id);

  if (!asList) {
    return (
      <Sheet visible={visible} title={title} sub={sub} onClose={onClose} footer={footer} doneLabel={multiple ? null : "Done"}>
        {options.length === 0 && <Hint>{emptyText ?? "Nothing to choose from."}</Hint>}
        {columns === 2 ? (
          <ChipGrid>
            {options.map((o) => <ChipCell key={o.id}><Chip block icon={o.icon} label={o.label} selected={isOn(o.id)} onPress={() => tap(o.id)} /></ChipCell>)}
          </ChipGrid>
        ) : (
          <ChipRow>{options.map((o) => <Chip key={o.id} icon={o.icon} label={o.label} selected={isOn(o.id)} onPress={() => tap(o.id)} />)}</ChipRow>
        )}
        {!multiple && value.length > 0 && <Hint>Tap the selected one again to clear it.</Hint>}
      </Sheet>
    );
  }
  return (
    <Sheet visible={visible} title={title} sub={sub} onClose={onClose} height={0.86} scroll={false} footer={footer} doneLabel={multiple ? null : "Done"}>
      <SheetSearch value={q} onChangeText={setQ} placeholder={`Search ${title.toLowerCase()}`} autoFocus={options.length > CHIP_LIMIT} autoCapitalize="none" />
      <FlatList
        data={shown}
        keyExtractor={(o) => o.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        ListEmptyComponent={<View style={{ padding: 20 }}><Hint>{options.length ? "No match." : emptyText ?? "Nothing to choose from."}</Hint></View>}
        renderItem={({ item }) => {
          const on = isOn(item.id);
          return (
            <Pressable onPress={() => tap(item.id)} accessibilityRole={multiple ? "checkbox" : "button"} accessibilityState={multiple ? { checked: on } : { selected: on }}
              style={({ pressed }) => [s.item, on && !multiple && s.itemOn, pressed && { backgroundColor: c.surfaceSunken }]}>
              {multiple ? <Checkbox checked={on} /> : on ? <Icon name="check" color={c.accent} /> : item.icon ? <Icon name={item.icon} /> : <View style={{ width: 24 }} />}
              <View style={{ flex: 1 }}>
                <Text style={[s.itemText, on && s.itemTextOn]}>{item.label}</Text>
                {!!item.meta && <Text style={s.itemMeta}>{item.meta}</Text>}
              </View>
            </Pressable>
          );
        }}
      />
    </Sheet>
  );
}

const useStyles = makeStyles((c) => ({
  item: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 56, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: c.borderSubtle },
  itemOn: { backgroundColor: c.accentTint },
  itemText: { ...type("body"), color: c.text },
  itemTextOn: { fontFamily: type("body", "bold").fontFamily },
  itemMeta: { ...type("small"), color: c.textDim },
}));
