# WiteBoard Roadmap Refresh

## Current State

The project has already shipped the original collaboration milestones:

- Real-time drawing sync with Socket.io
- Room-based boards with shareable URLs
- Board persistence on the server filesystem
- Live cursor presence and participant list
- Identity sync with custom names and colors
- Object locking for collaborative editing
- Export flow, password protection, and infinite canvas controls

That means the next plan should focus on hardening and polish rather than rebuilding the basics.

## Near-Term Priorities

### 1. Stabilize the Developer Experience

- Keep `npm run build` and `npm run lint` passing on every branch
- Reduce hook dependency warnings in complex canvas code
- Add a small smoke-test checklist for board join, draw, undo, export, and reconnect

Deliverable: a consistently shippable branch with fewer regressions during feature work

### 2. Deployment Readiness

- Replace the hardcoded Socket.io URL with environment-based configuration
- Document local, preview, and production environment variables
- Prepare frontend/backend deployment targets and CORS settings

Deliverable: one deployable frontend and one deployable realtime server

### 3. Persistence Hardening

- Define a board metadata model for title, owner, privacy, and timestamps
- Add retention or cleanup rules for stale JSON boards
- Revisit large image handling so board files do not grow uncontrollably

Deliverable: safer long-running storage for active boards

### 4. Collaboration Polish

- Improve reconnect behavior after temporary network drops
- Audit multi-user undo/redo expectations and edge cases
- Add clearer feedback when a stroke is locked by someone else
- Make board privacy changes more explicit when multiple users are present

Deliverable: a smoother multiplayer experience under real usage

### 5. UI and Workflow Improvements

- Add clearer empty, loading, and protected-board states
- Surface shortcut help in the interface
- Tighten selection, resize, and floating-selection interactions
- Improve mobile and tablet usability for note editing and canvas navigation

Deliverable: a more learnable and reliable board for first-time users

## Longer-Term Ideas

- Database-backed persistence with Redis or MongoDB
- Authenticated user accounts and board ownership
- Comments, reactions, or lightweight review mode
- Version history and board restore points
- Layer management
- Offline-first sync or CRDT-based conflict handling

## Resume-Safe Summary

WiteBoard is now beyond prototype stage. The strongest next step is to turn it from a feature-rich demo into a reliable deployable product by focusing on build health, deployment configuration, persistence strategy, and multiplayer UX refinement.
