# SouthStack Collaborative UI Builder — CSE327 Final Project

A fresh, working project for the NBM CSE327 final extension: a Figma-style UI builder connected over the same Wi-Fi, with image/photo-to-editable-UI generation, multi-human editing, shared audio resources, multi-screen support, and local UI agents.

## How to run in VS Code

1. Open this folder in VS Code.
2. Open the VS Code terminal.
3. Run:

```bash
npm start
```

4. On the host laptop, open:

```text
http://127.0.0.1:8000
```

5. For phone/other laptop peers on the same Wi-Fi, open the LAN URL printed in terminal, for example:

```text
http://192.168.x.x:8000
```

No `npm install` is needed because this version uses only built-in Node.js modules.

## What works

### Checkpoint 1 — Photo/sketch to editable UI + resource sharing

- Upload a UI screenshot/photo/sketch.
- Click **Generate UI**.
- The app creates a new editable mobile or web screen.
- Every generated layer can be dragged, resized, edited, duplicated, deleted, and exported.
- The generated UI is shared to all peers through the LAN host.
- Voice instructions can be recorded and shared as common peer resources.

### Checkpoint 2 — Multi-human co-development

- Open the same LAN URL on multiple devices connected to the same Wi-Fi.
- One peer can edit while another peer sees the changes.
- All peers can add layers, move layers, create screens, generate UIs, and run agent commands.

### Checkpoint 3 — Human-agent co-working

- The right-side **Local UI Agent** can generate screens/components using commands.
- Example prompts:
  - `make a clean login screen`
  - `make a dashboard with sidebar and cards`
  - `make a shopping app home screen`
- Agent-generated changes are editable and synced to peers.

## Demo flow for presentation

1. Start the server with `npm start`.
2. Open the host URL on the laptop.
3. Open the LAN URL on a phone.
4. Show that both devices are listed under **Peers online**.
5. Upload a UI photo or screenshot and press **Generate UI**.
6. Edit the generated layers from the laptop.
7. Edit another layer from the phone.
8. Record a short voice instruction and show it appearing under **Shared resources**.
9. Run the Local UI Agent prompt: `make a dashboard with sidebar and cards`.
10. Export the screen as HTML.

## Important explanation for viva

This is an offline-first LAN collaboration demo. It does not depend on cloud services. The "photo to UI" part uses a local browser-side heuristic vision helper instead of a paid cloud vision API. For a production version, the same hook can be replaced with an actual offline multimodal model.

## File map

- `server.js` — local LAN host, static server, shared project state, peer heartbeat.
- `public/index.html` — UI layout.
- `public/style.css` — Figma-like interface styling.
- `public/app.js` — builder logic, drag/drop, sync, image-to-UI, audio resources, local agent, export.
