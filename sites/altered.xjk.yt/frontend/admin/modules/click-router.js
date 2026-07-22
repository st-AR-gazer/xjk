export function createClickRoute(selector, run) {
  if (!selector || typeof run !== "function") throw new TypeError("Click routes require a selector and handler.");
  return Object.freeze({ selector, run });
}

export function createOrderedClickRouter(routes) {
  const orderedRoutes = [...routes];
  return async function dispatchClick(event) {
    const target = event?.target;
    if (!target || typeof target.closest !== "function") return false;

    for (const route of orderedRoutes) {
      const control = target.closest(route.selector);
      if (!control) continue;
      await route.run(control, { event, target });
      return true;
    }
    return false;
  };
}

export function createAdminClickHandler(context, routes) {
  const dispatchClick = createOrderedClickRouter(routes);
  return async function handleAdminClick(event) {
    const target = event?.target;
    const isHtmlTarget = context.isHtmlElement(target);
    context.state.lastActionControl = isHtmlTarget ? target.closest("button, a.btn, [role='button']") : null;

    if (!isHtmlTarget || !target.closest("[data-alteration-search]")) {
      context.hideAlterationSearchLists();
    }
    return dispatchClick(event);
  };
}
