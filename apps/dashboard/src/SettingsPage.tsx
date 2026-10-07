import type { ComponentChildren } from "preact";
import { FRAME_MODES, frameModeLabel } from "./format";
import type { MaskMode } from "./Framed";
import { DEFAULT_SETTINGS, updateSettings, useSettings } from "./settings";
import type { ThemeChoice } from "./theme";
import { Icon, LinkButton, Seg, Toolbar, ToolbarTitle } from "./ui";

interface Props { theme: ThemeChoice; onTheme: (t: ThemeChoice) => void; mask: MaskMode; onMask: (m: MaskMode) => void }

/** Settings (route #/settings): dashboard preferences, saved on change, per browser. */
export function SettingsPage({ theme, onTheme, mask, onMask }: Props) {
  const s = useSettings();
  return (
    <>
      <Toolbar><ToolbarTitle icon="cog-outline">Settings</ToolbarTitle><span class="meta">Saved on change, in this browser</span></Toolbar>
      <div class="f-scroll">
        <div class="settings">
          <Section icon="theme-light-dark" title="Appearance">
            <Row label="Theme" help="Auto follows the system. Sun is light for daylight, Set is dark for a dark set.">
              <Seg label="Theme" value={theme} onChange={onTheme} options={[{ id: "auto", label: "Auto" }, { id: "sun", label: "Sun" }, { id: "set", label: "Set" }]} />
            </Row>
            <Row label="Frame mode" help="How the rig frame is drawn on photos in Shots, Plan and when a shot opens (M cycles it).">
              <Seg label="Frame mode" value={mask} onChange={onMask} options={FRAME_MODES.map((m) => ({ id: m, label: frameModeLabel(m) }))} />
            </Row>
          </Section>
          <Section icon="image-plus" title="New shot">
            <Row label="Review state" help="Shots made with New shot (uploaded or drawn) start in this state. The dialog can still change it per shot.">
              <Seg label="Review state of new shots" value={s.newShotState} onChange={(v) => updateSettings({ newShotState: v })} options={[{ id: "approved", label: "Approved" }, { id: "unreviewed", label: "To review" }]} />
            </Row>
          </Section>
          <LinkButton onClick={() => updateSettings(DEFAULT_SETTINGS)}>Reset New shot settings</LinkButton>
        </div>
      </div>
    </>
  );
}

function Section({ icon, title, children }: { icon: string; title: string; children: ComponentChildren }) {
  return <section class="settings__sec"><h2><Icon name={icon} />{title}</h2>{children}</section>;
}
function Row({ label, help, children }: { label: string; help: string; children: ComponentChildren }) {
  return <div class="settings__row"><div><strong>{label}</strong><span class="meta">{help}</span></div><div>{children}</div></div>;
}
