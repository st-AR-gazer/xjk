import { clickContext } from "./click-context.js?v=2";
import { createAdminClickHandler } from "./click-router.js?v=2";
import { createAdminClickRoutes } from "./click-routes.js?v=2";

export const onClick = createAdminClickHandler(clickContext, createAdminClickRoutes(clickContext));
