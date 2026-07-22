import { createClickRoute } from "./click-router.js?v=2";

export function createOperationsClickRoutes(context) {
  const {
    guarded,
    handleClubAction,
    handleJobAction,
    handleSourceAction,
    loadActivity,
    loadMoreHistory,
    openDrawer,
    setHash,
    state,
  } = context;

  return [
    createClickRoute("[data-club-action]", (control) =>
      handleClubAction(
        control.dataset.clubAction,
        control.dataset.hookKey || "",
        Number(control.dataset.clubId || 0) || 0
      )
    ),
    createClickRoute("[data-source-action]", (control) =>
      handleSourceAction(control.dataset.sourceAction, control.dataset.sourceKey || "")
    ),
    createClickRoute("[data-activity-page]", async (control) => {
      const direction = control.dataset.activityPage;
      if (direction === "prev") {
        state.activity.cursor = Math.max(0, (state.activity.cursor || 0) - (state.activity.limit || 40));
      } else if (direction === "next" && state.activity.data?.nextCursor !== null) {
        state.activity.cursor = Number(state.activity.data.nextCursor || 0);
      }
      await guarded(`activity-page-${direction}`, loadActivity);
    }),
    createClickRoute("[data-reset-activity]", async () => {
      state.activity.filters = { kind: "all", mapUid: "", jobKey: "" };
      state.activity.cursor = 0;
      setHash("activity", {});
      await guarded("reset-activity", loadActivity);
    }),
    createClickRoute("[data-open-event]", (control) => {
      const payload = JSON.parse(control.dataset.openEvent || "{}");
      openDrawer({
        type: "event",
        kicker: "Event",
        title: payload.title || "Event",
        subtitle: payload.subtitle || "",
        payload,
      });
    }),
    createClickRoute("[data-job-action]", (control) =>
      handleJobAction(control.dataset.jobAction, control.dataset.jobKey)
    ),
    createClickRoute("[data-drawer-more-history]", (control) => loadMoreHistory(control.dataset.drawerMoreHistory)),
  ];
}
