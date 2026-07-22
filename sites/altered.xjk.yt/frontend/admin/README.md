# Altered admin frontend

`admin-v2.js` delegates application startup to `modules/lifecycle.js`. Feature modules own rendering and domain actions; the lifecycle module only connects them to browser events and polling.

Admin clicks use an ordered routing boundary:

- `click-handler.js` performs the shared click prelude and delegates dispatch.
- `click-router.js` implements first-match, short-circuit routing.
- `click-routes.js` records the feature ordering explicitly.
- `click-navigation.js`, `click-maps.js`, `click-operations.js`, and `click-naming.js` own cohesive action groups.
- `click-context.js` is the only click-routing module that imports runtime dependencies.

Route order is behavior. Add a new action to its owning feature group and test any intentional selector overlap.
