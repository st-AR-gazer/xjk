import { createMapClickRoutes } from "./click-maps.js?v=2";
import { createNamingClickRoutes } from "./click-naming.js?v=2";
import { createNavigationClickRoutes } from "./click-navigation.js?v=2";
import { createOperationsClickRoutes } from "./click-operations.js?v=2";

export function createAdminClickRoutes(context) {
  return [
    ...createNavigationClickRoutes(context),
    ...createMapClickRoutes(context),
    ...createOperationsClickRoutes(context),
    ...createNamingClickRoutes(context),
  ];
}
