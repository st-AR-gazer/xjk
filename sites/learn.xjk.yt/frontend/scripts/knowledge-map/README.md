# Knowledge-map runtime boundaries

`../knowledge-map.js` preserves the public `createKnowledgeMap` and `clusterColor` exports. The runtime is divided by
reason to change:

- `controller.js` owns layout, resize, animation scheduling, settings, and teardown.
- `camera.js` owns projection, focus, pan, zoom, rotation, and camera interpolation.
- `interactions.js` owns pointer hit-testing, dragging, click selection, cursor state, and tooltips.
- `renderer-2d.js` and `renderer-3d.js` own their respective canvas drawing passes.
- `renderer-shared.js` and `palette.js` contain drawing primitives shared by both renderers.

Renderers receive the controller state and do not install listeners or schedule frames. Interaction code does not draw,
and the public facade does not retain runtime state.
