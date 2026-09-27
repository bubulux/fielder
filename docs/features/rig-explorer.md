# Rig explorer

Dashboard shot dialog → **Explore rigs** (`apps/dashboard/src/RigExplorer.tsx`). It shows how the same photo would be framed by another rig and/or lens.

## Views

- **One rig**: pick a rig ("As shot" = the rig the photo was taken with) and a lens. A large framed image plus facts (FF-equivalent, FOV). Below it, a **lens strip** with a thumbnail per lens of that rig (within its lens range); click one to select it.
- **Compare**: A and B side by side, each with its own rig and lens.
- The view-mode switch (mask/frame/fit/raw) applies. Esc or "Back to details" returns to the dialog; arrow keys do not switch shots while exploring.

## Math (`packages/fov-math/src/fov.ts`, tested)

A photo only stores what the phone saw. The phone's field of view for that photo is recovered from the rig FOV it was framed with and the stored frame fractions (`phoneViewFromFrame`, the inverse of `overlayRect`). Any rig + lens is then framed on it with `reframe(source, sourceFrame, target)`. Portrait rigs swap axes (`fovOnPhoto`).

The source rig comes from the photo's `framing` snapshot (`sourceRigOf` in `apps/dashboard/src/format.ts`), so it works even if the preset was deleted. A combination wider than the phone's view gives fractions > 1: the frame is drawn beyond the photo (dashed) and marked "sees more than this photo". The photo cannot show what the phone did not capture.

`Framed.tsx` accepts a `frame` override for this.
