# Endfield Damage Simulator

A web-based damage calculator and skill rotation timeline tool for **Arknights: Endfield**.

## Tech Stack

- **React 19** + **TypeScript** — UI framework
- **Vite** — Build tool
- **Tailwind CSS v4** — Styling
- **Zustand** — State management
- **Recharts** — DPS visualization charts
- **@dnd-kit** — Drag-and-drop for timeline editing
- **Lucide React** — Icons

## Getting Started

```bash
npm install
npm run dev        # Start dev server at localhost:5173
npm run build      # Production build to dist/
npm run preview    # Preview production build
```

## Deployment

Pushes to `main` auto-deploy to GitHub Pages via `.github/workflows/deploy.yml`.

## Project Structure

```
src/
  engine/          # Pure TypeScript DPS math & timeline simulation
    types.ts       # Operator, Skill, Weapon, Timeline types
    formulas.ts    # Damage formulas
    timeline.ts    # Timeline simulation engine
    dataLoader.ts  # Load operator data from JSON
  stores/          # Zustand state management
    partyStore.ts  # Party configuration state
    timelineStore.ts # Timeline & simulation state
  components/
    layout/        # Header, sidebar
    party/         # Operator slots, operator picker
    timeline/      # Timeline canvas, tracks, skill blocks
    dps/           # DPS result charts and breakdowns
  data/            # Static JSON game data
  pages/           # Route pages (Home, Simulator)
  lib/             # Shared utilities
```
