# Tracker shell frontend

`app.js` is the browser bootstrap for the persistent tracker host. The implementation lives under `app/`:

- `route-model.js` owns route configuration and mounted-path URL construction.
- `overview-view.js` owns overview markup and status element updates.
- `overview-controller.js` owns overview refresh and timer lifecycle.
- `service-status.js` owns status requests, formatting, and reachability summaries.
- `runtime-frame.js` owns iframe markup, embedded styling, and load cleanup.
- `navigation.js` owns chrome links, click policy, and history transitions.
- `controller.js` composes route rendering and browser lifecycle events.

Runtime services remain isolated inside same-origin iframes. Changes to mount paths or iframe URLs belong in the route model rather than individual views.
