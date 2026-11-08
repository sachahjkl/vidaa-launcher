# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [0.1.0] — 2026-11-08

First public snapshot of the launcher as it runs on the TV.

### Added

- `launcher/index.html`: the home screen. Wii-inspired channel grid of 4 × 3
  landscape tiles, paging, sources and applications mixed as channels, pointer
  and D-pad navigation, and a full Réglages page (Affichage, Sources,
  Applications, Système).
- Automatic night theme between 20:00 and 08:00, with a manual Clair / Sombre
  override kept in `localStorage`.
- Glass tile look: 2 px bevel, curved inner vignette, scanlines, one glow on the
  focused channel.
- Nunito variable font embedded as a `data:` URI; no network request for the
  page itself.
- Offline mode: the last WebSocket snapshot, then a built-in default list, with
  queued settings sent on reconnection.
- `games/remote.html`, `games/keyboard.html`, `games/memory.html`,
  `games/music.html`, `games/sort.html`: five self-contained games for ages
  4–7, sound starting on the first input.
- `host/tvhost.js`: Node server on the TV. Static files on `127.0.0.1:8766`,
  WebSocket `/ws`, HTTP `/api/*`, and a minimal MQTT 3.1.1 client over TLS for
  the TV's own broker (app list, inputs, source switching, app launch, shell).
- Last-input restore a few seconds after boot, and a fallback to the launcher
  when there is no input to restore.
- `lab/index.html`: a shell console for the TV, served at `/lab/`.
- `tools/`: Pillow scripts that draw the channel scenes, the source artwork, the
  glass tile overlay and the app icon.
- 1080p screenshots of both themes and of Réglages.
