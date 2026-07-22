# Platonic Solids Studio frontend

`solids.js` is the stable browser entrypoint. The implementation is divided by responsibility under `solids/`:

- `geometry.js` owns the canonical solid data and pure vector, rotation, projection, edge, and color operations.
- `model.js` owns initial state, reset/randomization policy, and deterministic export planning.
- `renderer.js` owns canvas sizing, background drawing, solid rendering, and the animation loop.
- `export.js` owns PNG, animated WebP, and WebM encoding and download lifecycle.
- `controller.js` composes the page, form controls, playback, pointer orbiting, renderer, and exporters.

Keep geometry and export-plan behavior covered in `solids/solids.test.mjs`. New UI behavior belongs in the focused
owner rather than expanding the entrypoint or introducing another page-global controller.
