# Lanceur TV, version 2

`index.html` is a single-file launcher for a Hisense TV (VIDAA, Chromium 111). It has no dependencies and no build step. It only talks to the local server: the WebSocket at `ws://127.0.0.1:8766/ws`, and app icons at local relative URLs. All labels are in French. The previous version in `../launcher/` is unchanged.

## Look

The layout follows the console channel menu in `../reference/wii-menu.png`. It uses our own artwork: no third-party logos or lettering.

- **Background**: pale silver, with a soft vertical gradient, a faint horizontal sheen and fine lines. The grid sits directly on it, with no panel behind.
- **Grid**: 4 × 3 landscape channels (4:3) per page, with small even gaps. Pages turn sideways. Blue side arrows (for the pointer) appear only when there is a page in that direction.
- **Channel**:
  - The artwork fills the tile, inside a thin 2 px white bevel with about 10 px rounded corners and a light top highlight.
  - The name is written on the artwork, top-left, in white with a soft shadow, over a light dark gradient so it always reads.
  - There is no footer strip.
- **Focus**: the channel lifts slightly and scales to 1.03. Its white border thickens and a soft blue glow appears (200–220 ms).
- **Empty cells**: faint embossed grey placeholders with a soft screen outline.
- **Bottom bar**: a light metallic strip under a curved cyan line. It holds:
  - the round **home** button (our launcher mark) on the far left;
  - the status and the page indicator (dots and "page 2 / 6");
  - the large clock with the date under it, in the centre;
  - the last input and the number of applications;
  - the round **settings** button on the far right.
- **Clock**: 24-hour by default, the French convention. Set `CLOCK_12H = true` in the script for "9:47" with a small "PM".

## Inputs are channels

There is no separate sources row. TV and HDMI 1–4 are the first channels of page 1, before the applications.

- **Artwork**: exactly like an app channel. The source's `icon` fills the tile; with no `icon` (null or missing), a two-letter monogram on a tinted gradient ("H1", "Co"). The name is written on it, top-left.
- **Signal**: a pill at the bottom left shows `Signal présent`, `Pas de signal` or `Signal inconnu`.
- **Tag**: `en cours` (blue) or `dernière` at the top right.
- **Start-up focus**: the focus starts on the last input used.

## Rendering: native resolution, no global scale

The page has no fixed stage and no `transform: scale()`. Every size is in `rem`, and the root font size follows the real viewport:

```css
html { font-size: min(0.5208333vw, 0.9259259vh); }   /* 1rem = 10 "design px" of 1920x1080 */
```

| Viewport | 1rem |
| --- | --- |
| 1280×720 | 6.67 px |
| 1920×1080 | 10 px |
| 3840×2160 | 20 px |

At each of these sizes the layout is the same, drawn at the device's own resolution.

- **Not 16:9**: the grid stays centred at the top, and the bar stays full width at the bottom.
- **Paging**: page turns translate the grid in `rem`, so there is no measuring and no resize handler.
- **Cheap effects**:
  - One short shadow per element. The blue glow appears only on the focused element.
  - No blur filters, no `will-change`, no `backdrop-filter`.
  - Only `transform` and `opacity` animate.

## Navigation

- **Grid**:
  - The arrows move cell by cell.
  - Left and right cross to the neighbouring page at the edges.
  - Down from the bottom row, or from above an empty cell, reaches the round buttons. Up from the buttons returns to the visible page.
- **Paging**: P+/P− (427/428) and PageUp/PageDown move one page. With the pointer, use the side arrows or the wheel.
- **Home button**: returns to page 1 and focuses the last input.
- **Settings button**: opens Réglages. The Menu key does the same.
- **Pointer**: focus follows the cursor, and OK activates.

## Réglages

Réglages is a full page that slides in from the right, on the same silver background as the menu. Its look follows a console's system-settings screen, with our own pictograms and wording.

- **Title plate** at the top: "Réglages › Affichage" (the current category) and the connection status.
- **Left column**: four rounded category tiles, each with a round pictogram (inline SVG), a label and a one-line summary:
  - **Affichage** ("Reprise auto : OUI");
  - **Sources** ("4 / 5 affichées");
  - **Applications** ("60 / 62 affichées");
  - **Système** ("En ligne" / "Hors ligne").

  The shown category has a blue pictogram and a pale blue tile.
- **Right panel**: a thick rounded white surface. Each row is a wide rounded bar: label (3rem) and a short description on the left, the value in bold on the right.
  - **Affichage**:
    - "Démarrer sur la dernière entrée": `OUI` / `NON` with a switch (`autoSwitch`).
    - "Entrées sur l'accueil" and "Applications sur l'accueil": the counts ("4 / 5"). OK opens that category.
  - **Sources / Applications**: one row per item, with its artwork (icon or monogram), `Affichée` / `Masquée` and a switch. Six rows per page. The header shows the count ("58 sur 62 affichées"), the position of the focused item ("13 / 62") and the page ("page 3 / 11"), with ▲ ▼ arrows for the pointer.
  - **Système**:
    - Information rows (not focusable): Connexion (with the settings waiting to be sent), Entrée en cours, Dernière entrée, Données (age).
    - **Tout réafficher** sends `hidden: []`.
    - **Réinitialiser** needs a second OK within 5 s. It clears the last input and the offline queue, and sends `autoSwitch: false` and `hidden: []`.
- **Bottom bar**: a metallic strip under a curved cyan line, with "Retour" on the left, a key hint in the middle, and a big round "OK" on the right.
  - **Retour** returns to the menu.
  - **OK** returns to the menu and confirms "Réglages enregistrés" (or "…, envoyés à la reconnexion" when settings are queued). Changes already apply as soon as they are made.
- **Focus**: a soft blue fill with a white ring and a thin blue outline.
- **Feedback**: each change shows a short message. Offline, it adds "(envoyé à la reconnexion)".

### Navigation in Réglages

- **Categories**: ▲ ▼ move between them, and the panel follows at once. ▶ or OK enters the rows. ▼ from the last tile reaches Retour.
- **Rows**: ▲ ▼ move between rows. At the edge of a page they turn to the previous or next page. ▼ after the last row reaches OK. ◀ returns to the category.
- **Bottom bar**: ◀ ▶ switch between Retour and OK. ▲ returns to the rows (from OK) or the category (from Retour).
- **Paging**: P+/P− and PageUp/PageDown turn one page. With the pointer, use ▲ ▼ in the panel header or the wheel over the panel.
- **Back** (Back key, Escape, Backspace) closes Réglages from anywhere on the page.
- **Pointer**: hovering a category shows it, and hovering a row focuses it. A click acts like OK.
- **Reopening** Réglages returns to the last category and element used.

### Many applications (60+) in Réglages

The rows are a pool of at most six buttons, refilled for each page. 62 apps cost six rows in the DOM. A slot that keeps its item keeps its switch, so the knob slides. When a slot changes item, the knob jumps into place without animating. While Réglages is open, the icons of the visible rows load first.

## Many applications (60+)

- **DOM**: each channel is built once per id and kept. A `state` message only updates, reorders or detaches channels. Each one is placed in its page, row and column by `grid-column` / `grid-row`.
- **Placeholders**: they come from a small reused pool and fill the rest of the last page.

## Icons

- **Field**: `icon` is optional, for example `"/icons/123.png"`. Only local paths are accepted. Anything with a scheme or starting with `//` is ignored.
- **Fallback**: until the icon is ready, the channel shows a two-letter monogram ("PV", "Ne") on a soft tinted gradient that fills the tile.
- **Display**: once the icon has loaded and decoded, it fades in with `object-fit: cover`. A broken image or a blank tile never appears.
- **Loading**:
  - Each URL is loaded and decoded once, up to 4 at a time. While Réglages is open, its visible rows load first. Then the current page, then nearby pages, then hidden items.
- **Sources** use the same `icon` field, the same loader and the same fallback as apps.
  - Each load has an 8 s timeout. Icons that failed get one more try after the server reconnects.

## WebSocket contract

The client reconnects every 3 s. A connection stuck in CONNECTING is dropped after 6 s. The only addition is the optional `icon` on sources.

```json
{"t":"state","apps":[{"id":"netflix","name":"Netflix","kind":"tv","sub":"","icon":"/icons/12.png"}],
 "sources":[{"id":"hdmi2","name":"HDMI 2","signal":true,"icon":"/icons/src-google.png"}],"current":"hdmi2",
 "settings":{"autoSwitch":true,"hidden":["labo"]}}
{"t":"ok"}  {"t":"error","message":"…"}

{"t":"launch","id":"netflix"}  {"t":"source","id":"hdmi2"}
{"t":"setting","key":"autoSwitch","value":true}
{"t":"setting","key":"hidden","value":["labo","hdmi4"]}
```

- **`kind`**: `app`, `game`, `lab` and `settings` are the owner's entries, shown first. Any other value, or no value, is a TV app.
- **Source `id`**: must be `tv` or `hdmi1`…`hdmi4`. Other ids are ignored.
- **Source `icon`**: optional, a local URL like the apps' `icon`. `null` or missing shows the monogram.
- **Each `state`** is a full snapshot. If `apps` or `sources` is missing, the previous list is kept.

## Offline

The localStorage keys are the same as in v1.

| Key | Content |
| --- | --- |
| `tvlauncher.v1.snapshot` | The last `state` received and its time. |
| `tvlauncher.v1.lastSource` | The last input used. |
| `tvlauncher.v1.pendingSettings` | Settings changed while offline. |

- **Start-up**: the launcher shows the cached data, or the built-in defaults if there is no cache. The screen is never blank: empty cells show placeholders.
- **Offline**:
  - The status in the bar reads "hors ligne · données reçues …".
  - Signals show as unknown.
  - Launching an app or switching input shows a message and sends nothing.
- **Settings changed offline**: they apply at once and are queued. After the next `state`, the launcher applies them on top of it and sends them.

## Keys

- **Back**: keyCodes 8, 27, 461, 10009, or `key` = `GoBack` / `BrowserBack`. Back never leaves the page.
- **Menu**: keyCodes 93 and 457, or `key` = `ContextMenu` / `Menu` / `Settings` / `m`.
- **Not tested on the TV**: the exact codes for Menu and P+/P−. If one does nothing, log `e.keyCode` and add it to `MENU_CODES` or `PAGE_CODES`.

## Not verified

The page was checked only in desktop Chrome (headless, 1920×1080), with a fake WebSocket serving 62 apps and 5 sources. That run covered Réglages (each category, paging to the last page, a toggle sent and one queued offline, the double press of Réinitialiser, Back to the menu) and the source channels with artwork and with monograms. It has not been tested on the TV. Check these first:

- **Rendering**: the viewport size the TV reports, and the native-resolution rendering.
- **Fonts**: which fonts the TV actually has.
- **Remote key codes**: Menu and P+/P− (see Keys).
