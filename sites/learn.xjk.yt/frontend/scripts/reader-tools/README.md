# Reader-tools runtime boundaries

`../reader-tools.js` preserves the public render and hydration exports. `controller.js` is the delegated-event lifecycle
boundary and composes these focused features:

- `panel-registry.js` owns toolbar and drawer markup; `drawer-controller.js` owns panel visibility and source loading.
- `find-controller.js` owns text marking and match navigation.
- `navigation-controller.js` owns heading detection, jumps, pins, links, sharing, and section copying.
- `progress-controller.js` owns the reading-progress calculation.
- `notes-controller.js` and `suggestion-controller.js` own their authenticated submission flows.
- `content-index.js` derives headings, links, media, and audit entries from the lesson AST.

Feature controllers receive the DOM and browser dependencies they use. They do not install their own top-level event
listeners; the lifecycle controller keeps one delegated listener set on the lesson panel and removes it during cleanup.
