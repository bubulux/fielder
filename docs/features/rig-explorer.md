# Rig explorer

Dashboard shot view (or Review) → stage **Rigs** (`R`; `apps/dashboard/src/RigExplorer.tsx`). It shows how the same photo would be framed by another rig and/or lens. The inspector stays visible.

## Views

- **One rig**: the stage bar has a rig picker ("As shot" = the rig the photo was taken with) and a lens picker, plus the facts (FF-equivalent, horizontal and vertical FOV). The stage shows the photo with that frame; nothing is drawn over the photo. The frame mode applies (Fit crops to the chosen rig's frame). The stage foot is a **lens strip**: a thumbnail per lens of that rig (within its lens range); click one to select it. **←/→ step the lens** here, so shot navigation is paused.
- **Compare A / B**: two panes side by side, each with its own rig and lens pickers and facts.
- The frame-mode switch applies. Esc or "Back to photo" returns to the Photo stage.

## Math (`packages/fov-math/src/fov.ts`, tested)

A photo only stores what the phone saw. The phone's field of view for that photo is recovered from the rig FOV it was framed with and the stored frame fractions (`phoneViewFromFrame`, the inverse of `overlayRect`). Any rig + lens is then framed on it with `reframe(source, sourceFrame, target)`. Portrait rigs swap axes (`fovOnPhoto`).

The source rig comes from the photo's `framing` snapshot (`sourceRigOf` in `apps/dashboard/src/format.ts`), so it works even if the preset was deleted. A combination wider than the phone's view gives fractions > 1: the frame is drawn beyond the photo (dashed) and the facts line says "sees more than this photo". The photo cannot show what the phone did not capture.

`Framed.tsx` accepts a `frame` override for this.
