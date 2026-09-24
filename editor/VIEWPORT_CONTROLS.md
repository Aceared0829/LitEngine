# Perspective viewport controls

The editor follows the regular-mouse perspective defaults in [Unreal Engine viewport controls](https://dev.epicgames.com/documentation/unreal-engine/viewport-controls-in-unreal-engine?lang=zh-CN). It does not change the default PlayCanvas `CameraControls` script used by engine examples.

| Input | Camera action |
| --- | --- |
| Click LMB | Select entity |
| LMB drag | Move horizontally forward/backward and turn left/right |
| RMB drag | Look around in place |
| LMB + RMB drag, either press order | Pan in the camera plane |
| MMB drag | Pan in the camera plane |
| RMB + W/S/A/D or arrow keys | Fly along camera forward/right |
| RMB + E/Q | Rise/fall along **world Z**, independent of pitch |
| Wheel | Dolly forward/backward |
| RMB + wheel | Adjust camera fly speed |
| Alt + LMB | Orbit the selected pivot |
| Alt + RMB | Dolly toward/away from pivot |
| Alt + MMB | Pan |
| ~ / ` / X | Toggle world/local coordinate space |
| F / Shift+F | Frame selection / frame scene |
| Shift / Ctrl while flying | 2x / 0.5x movement speed (editor convenience) |

The LitEngine editor now authors its demonstration scene with +X forward, +Y right and +Z up on an XY floor. Camera navigation and the Inspector use these axes. This editor setting does not switch the PlayCanvas engine defaults or convert external scenes and assets.

The viewport Speed input and RMB wheel update the same speed (0.1–1000 world units per second). Keyboard tool shortcuts Q/W/E/R and coordinate space toggle (~ / X) are suspended synchronously while RMB navigation owns input. Text controls keep their own keyboard events. Alt or mouse chords cannot become selection clicks at gesture end, and leaving the canvas with captured input, losing focus, cancellation, and partial button releases are handled without latching flight.

Orthographic views, Magic Mouse/trackpad-specific gestures, remappable bindings, temporary FOV zoom, and distance-based speed preferences are not part of this perspective-only implementation.

## Verification

- `npm run build:rel:esm` and `npm run build:dbg:esm` after changing engine input sources.
- `npm --prefix editor run lint`, `npm --prefix editor test`, `npm --prefix editor run build`.
- Root `npm test` includes source-level button-mask regression tests.
- `editor/test/viewport-camera-controls.test.mjs` drives real KeyboardMouseSource, the editor camera controller and PlayCanvas Entity transforms with synthetic input events.
- `editor/test/electron-menu.test.mjs` covers menu -> mocked IPC -> actual preload -> desktop adapter -> EditorController -> runtime dispatch; it does not replace an installed Electron app smoke test.
