# Projects

Every shot belongs to exactly one project (a film, a commercial). Locations, rigs, saved views and extra-field definitions are shared across projects; shooting days belong to a project.

## Behaviour

- **Active project, chosen once.** Both clients ask which project to work on and remember it until you change it: dashboard in `localStorage["project"]`, phone in the kv-store (`activeProjectId.v1`).
- **Dashboard:**
  - A first visit (or a remembered project that no longer exists) shows the full-window project picker (`ProjectGate` in `Projects.tsx`).
  - The sidebar's scope switcher lists the projects, "All projects" and "Manage projects…"; ⌘K → a project name switches too.
  - "All projects" is the global explorer: every shot, with a Project column in the list and a project tag on cards and map popups. Plan needs a single project.
  - Library › Projects: a list (shots, fields, "can be deleted") and a detail with name and notes (saved when leaving the field), the project's [extra fields](extra-fields.md) in order (add, reorder, remove), "Show n shots" and "Make active". Only empty projects can be deleted.
  - A shot moves to another project via the Project box in the shot view's inspector. When it is planned on shooting days, a warning says how many it leaves, and Move confirms.
- **Phone:**
  - After sign-in (or skipping it), a full-screen gate asks for a project if none is active (`screens/Gates.tsx`). You switch with the **project pill** in every header, the HUD project chip on Shoot or Setup → Project; all open the Project sheet (`components/ProjectSheet.tsx`, a search above 8 projects, "New project" by name, works offline). A switch says "Now shooting for …".
  - Projects can be created offline; they sync before any queued shot uploads.
  - The camera HUD shows the active project name. The shutter is disabled without a project.
  - Review, Shots and Day show only the active project (`useShots(projectId)` → `GET /api/shots?project_id=`).

## Sync details (phone)

`flush()` in `apps/mobile/src/uploads.ts` runs `syncProjects` (`namedSync.ts`) first:
1. It pushes unsynced projects. A name clash (409) adopts the server's id and remaps queued shots and the active project id.
2. It pulls the server list (with `field_ids`) and keeps projects created while the sync was running.
3. It notifies `onFlushed` listeners, which lets `App.tsx` pick up renamed or remapped ids.

## Code

- Worker: `apps/worker/src/projects.ts`
- Dashboard: `App.tsx` (active project, filtering), `Projects.tsx`
- Phone: `App.tsx`, `screens/Gates.tsx`, `components/ProjectSheet.tsx`, `namedSync.ts`, `storage.ts`
