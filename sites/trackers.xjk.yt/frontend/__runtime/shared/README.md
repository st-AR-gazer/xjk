# Shared tracker browser runtime

The WR and leaderboard mode directories contain stable shims that set `XjkTrackerConfig.mode` and load `tracker-shared/public-app.js`. The server maps `tracker-shared/` to this directory, so both modes execute the same implementation without copying browser code.

`public-app.js` is a composition root only. Its modules own one boundary each:

- `public-app/config.js` resolves mode, mount routes, primary-read policy, and timing limits.
- `public-app/transport.js` owns local/primary API selection and gateway response metadata.
- `public-app/state-rendering.js` creates shared state, collects elements, and renders tracker views.
- `public-app/live-stream.js` owns EventSource lifecycle, reconnects, and live check ingestion.
- `public-app/commands-events.js` owns user commands and DOM event bindings.
- `public-app/controller.js` coordinates refreshes and boot order.

Mode-specific behavior must derive from the injected config or tracker API response. Do not fork these modules into WR and leaderboard variants. Keep network policy out of renderers, DOM mutation out of transport, and listener/timer startup in the controller or live-stream lifecycle.
