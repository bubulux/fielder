# Projects

Every shot belongs to exactly one project (a film, a commercial). Locations, rigs, saved views and extra-field definitions are shared across projects; shooting days belong to a project.

## Behaviour

- **Active project, chosen once.** Both clients ask which project to work on and remember it until you change it: dashboard in `localStorage["project"]`, phone in the kv-store (`activeProjectId.v1`).
- **Dashboard:**
  - A first visit (or a remembered project that no longer exists) shows the project picker (`Projects.tsx` with `gate`).
  - The header has a project switcher with "All projects" and "Manage projects…".
  - "All projects" is the global explorer: every shot, with a Project column in the list and in card subtitles. The Schedule needs a single project.
  - The Projects tab can create, rename, edit notes and pick the project's [extra fields](extra-fields.md). Only empty projects can be deleted.
  - A shot moves to another project via the Project box in its info panel. It then leaves the old project's shooting days.
- **Phone:**
  - After sign-in, `ProjectSheet` asks for a project if none is active. You switch under Setup → Project.
  - Projects can be created offline; they sync before any queued shot uploads.
  - The camera HUD shows the active project name. The shutter is disabled without a project.
  - Gallery, Review, Map and Day show only the active project (`useShots(projectId)` → `GET /api/shots?project_id=`).

## Sync details (phone)

`flush()` in `apps/mobile/src/uploads.ts` runs `syncProjects` (`namedSync.ts`) first:
1. It pushes unsynced projects. A name clash (409) adopts the server's id and remaps queued shots and the active project id.
2. It pulls the server list (with `field_ids`) and keeps projects created while the sync was running.
3. It notifies `onFlushed` listeners, which lets `App.tsx` pick up renamed or remapped ids.

## Code

- Worker: `apps/worker/src/projects.ts`
- Dashboard: `App.tsx` (active project, filtering), `Projects.tsx`
- Phone: `App.tsx`, `components/ProjectSheet.tsx`, `namedSync.ts`, `storage.ts`
