# Alterations frontend

`alterations.js` is the browser entrypoint. It loads the shared HTML sanitizer and delegates startup to the controller.

The implementation is split by responsibility:

- `alterations/controller.js` coordinates navigation, loading, and page events.
- `alterations/transport.js` owns API endpoints and uses the shared bounded paginator.
- `alterations/state.js` owns normalized state, timeline ordering, filtering, and derived statistics.
- `alterations/views.js` renders catalog, campaign, and map-card views.
- `alterations/modal.js` renders and controls map details.

Keep API calls out of views and DOM operations out of state and transport. New URL-driven views should be composed in the controller rather than added to the entrypoint.
