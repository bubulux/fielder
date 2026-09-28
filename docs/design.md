# Design system

Both clients follow one design system, made with Claude Design on 2026-09-28. The owner keeps the full export (component specimens, contrast tables, UI kits) outside the repo, in the gitignored `references/Design System/`. The parts the code uses are copied into the repo (see [Where it lives](#where-it-lives)).

## Themes

Both themes are high contrast, and both follow the OS by default.
- **Sun** (light): near-white page (`#F7F7F5`), white surfaces, near-black ink. For harsh daylight outdoors.
- **Set** (dark): near-black page (`#0B0B0C`), stepped grey surfaces, off-white text. No large bright areas, so it doesn't glare on a dark set.

Switching:
- **Dashboard**: header switch Auto / Sun / Set. Stored in `localStorage["theme"]`; absent means Auto. An inline script in `index.html` sets `data-theme` on `<html>` before first paint; `src/theme.ts` keeps it in sync.
- **Phone**: `settings.theme` (`"auto" | "sun" | "set"`), set in Setup → Display, or with the Sun/Set button on the camera screen (one tap flips it and leaves Auto). Auto uses `useColorScheme()` (`app.json` has `userInterfaceStyle: "automatic"`).

## Rules

- **Contrast**:
  - body and label text ≥ 7:1
  - dim text ≥ 4.5:1
  - every control border ≥ 3:1
  - `--border-subtle` is only for decorative dividers, never the only affordance
  The ratios are listed in the export (`guidelines/contrast.md`). Re-check a pair if you change a value.
- **Never colour alone.**
  - Selected = accent fill + bold + a check icon, or an accent bar on rows.
  - A state = colour + icon + label; icon-only on thumbnails, then it carries a title.
  - A disabled control is dashed.
- **Pills choose, rectangles act.** Tabs, segmented switches and chips are pills. Action buttons are rounded rectangles.
- **Photos never take the theme**: black letterbox, neutral mask (`rgba(0,0,0,.62)`), white frame line with a black outline, dashed when the rig sees more than the photo. Anything over a photo is opaque (black badges, solid chrome), never translucent text.
- **Semantic tokens only.** Use `--bg`, `--surface`, `--text`, `--text-dim`, `--border`, `--accent`, `--ok`, `--danger`, `--warn`, `--phase-*` and so on; never a hex value in a component. The only fixed colours are those drawn over photos or maps: photo black, frame white/black, the human-view cyan, recording red, and map pins.
- **Accent is cobalt.** Amber (`--warn`) means only "warning / unreviewed".
- **Icons**: Material Design Icons, with the same names on both clients. Shared names (review states, light phases) are `STATE_ICONS` and `PHASE_ICONS` in `packages/vocab`.
- **Font**: Atkinson Hyperlegible Next, chosen for legibility under glare (1/l/I and 0/O are distinct). Readouts use tabular figures (`.num`).
- **Copy**: sentence case, units spaced (`24 mm`, `±5 m`, `30 %`), `·` between facts, no emoji.

## Where it lives

| Surface | Files |
| --- | --- |
| Phone | `apps/mobile/src/theme.tsx`: the Sun and Set palettes (from `fielder-tokens.rn.json`), `FIXED` colours for things over photos, the type scale (`type(step, weight)`: the custom font needs a family per weight, so use it instead of `fontWeight`), `RADIUS`, `SIZE`, `BORDER`, `ThemeProvider`, `useTheme()` and `makeStyles()` (a themed `StyleSheet`, built once per theme). `components/ui.tsx` holds the primitives (`Icon`, `Button`, `IconButton`, `Chip`, `Seg`, `Toggle`, `Input`, `Sheet`, `Header`, `Row`, `StateMarker`, `SeqBadge`, `Banner`, `Empty`, `Hint`). Icons come from `@expo/vector-icons/MaterialCommunityIcons`; the font from `@expo-google-fonts/atkinson-hyperlegible-next` (only the five weights used are imported, per weight). Maps in WebViews share `components/mapHtml.ts`. Control borders are 2 dp and touch targets at least 48 dp. |
| Dashboard | `apps/dashboard/src/design/*.css`: tokens (`colors.css`, `typography.css`, `spacing.css`) and component classes (`f-btn`, `f-tab`, `f-seg`, `f-chip`, `f-input`, `f-combo__*`, `f-card`, `f-state`, `f-seq`, `f-tl__*`, `f-wx__*`, `f-pin`, …), copied unchanged from the export. `src/ui.tsx` wraps the common ones (`Icon`, `Seg`, `Chip`, `LightChips`, `StateMarker`, `SeqBadge`, `Empty`, `Loading`, `ErrorLine`). `src/styles.css` holds only the layouts and must use tokens. Fonts and the MDI webfont are loaded in `index.html`. |

To update the design system: re-export from Claude Design, copy the changed CSS over `apps/dashboard/src/design/`, carry colour changes into the palettes in `apps/mobile/src/theme.tsx`, and check the screens that use them.
