import express from "express";
import { parseOptionalBoolean } from "../../../shared/valueUtils.js";

function createOpsAdminRoutes(service) {
  const router = express.Router();

  router.get("/schema/mermaid", (_req, res) => {
    return res.json({
      format: "mermaid-er",
      diagram: service.getSchemaMermaid(),
    });
  });

  router.get("/overview", (_req, res) => {
    return res.json(service.getOverview());
  });

  router.get("/users", (req, res) => {
    const users = service.listUsers(Number(req.query.limit) || 250);
    return res.json({ users, count: users.length });
  });

  router.get("/user-types", (_req, res) => {
    const userTypes = service.listUserTypes();
    return res.json({ userTypes, count: userTypes.length });
  });

  router.post("/users", (req, res) => {
    const result = service.createUser(req.body || {});
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/users/:userId/addresses", (req, res) => {
    const result = service.addUserAddress({
      userId: Number(req.params.userId) || 0,
      title: req.body?.title,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/users/:userId/addresses", (req, res) => {
    const addresses = service.listUserAddresses(Number(req.params.userId) || 0, Number(req.query.limit) || 100);
    return res.json({ addresses, count: addresses.length });
  });

  router.post("/users/:userId/schedules", (req, res) => {
    const result = service.createSchedule({
      userId: Number(req.params.userId) || 0,
      goal: req.body?.goal,
      scheduleCloudId: req.body?.scheduleCloudId,
      intervalHours: req.body?.intervalHours,
      enabled: parseOptionalBoolean(req.body?.enabled),
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/schedules", (req, res) => {
    const schedules = service.listSchedules({
      userId: req.query.userId ? Number(req.query.userId) : null,
      limit: Number(req.query.limit) || 500,
    });
    return res.json({ schedules, count: schedules.length });
  });

  router.post("/schedules/:scheduleId/runtime", (req, res) => {
    const result = service.updateScheduleRuntime({
      scheduleId: Number(req.params.scheduleId) || 0,
      enabled: parseOptionalBoolean(req.body?.enabled),
      intervalHours: req.body?.intervalHours,
      nextRunAt: req.body?.nextRunAt,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/users/:userId/maps", (req, res) => {
    const result = service.addMonitoredMap({
      userId: Number(req.params.userId) || 0,
      mapUid: req.body?.mapUid,
      mapName: req.body?.mapName,
      enabled: parseOptionalBoolean(req.body?.enabled),
      sourceLabel: req.body?.sourceLabel,
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/maps", (req, res) => {
    const maps = service.listMonitoredMaps({
      userId: req.query.userId ? Number(req.query.userId) : null,
      enabledOnly: parseOptionalBoolean(req.query.enabledOnly) === true,
      limit: Number(req.query.limit) || 5000,
    });
    return res.json({ maps, count: maps.length });
  });

  router.post("/maps/:mapUid/check-now", async (req, res) => {
    const result = await service.checkMapNow({
      userId: Number(req.body?.userId) || 0,
      mapUid: req.params.mapUid,
      reason: req.body?.reason || "manual-check",
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.get("/runs", (req, res) => {
    const runs = service.listPollRuns({
      limit: Number(req.query.limit) || 100,
    });
    return res.json({ runs, count: runs.length });
  });

  router.get("/events", (req, res) => {
    const events = service.listPollEvents({
      mapUid: req.query.mapUid || "",
      limit: Number(req.query.limit) || 200,
    });
    return res.json({ events, count: events.length });
  });

  router.get("/bot/config", (_req, res) => {
    return res.json({
      config: service.getBotConfig(),
    });
  });

  router.post("/bot/config", (req, res) => {
    const config = service.updateBotConfig({
      enabled: parseOptionalBoolean(req.body?.enabled),
      botName: req.body?.botName,
      guildId: req.body?.guildId,
      channelId: req.body?.channelId,
      webhookUrl: req.body?.webhookUrl,
      announceWrChanges: parseOptionalBoolean(req.body?.announceWrChanges),
      mentionRoleId: req.body?.mentionRoleId,
      footerText: req.body?.footerText,
    });
    return res.json({ config });
  });

  router.get("/bot/commands", (req, res) => {
    const commands = service.listBotCommands({
      status: req.query.status || "",
      limit: Number(req.query.limit) || 200,
    });
    return res.json({ commands, count: commands.length });
  });

  router.post("/bot/commands", (req, res) => {
    const result = service.enqueueBotCommand({
      commandType: req.body?.commandType,
      payload: req.body?.payload || {},
      source: req.body?.source || "manual",
    });
    if (result.error) return res.status(400).json(result);
    return res.json(result);
  });

  router.post("/bot/commands/:commandId/status", (req, res) => {
    const command = service.updateBotCommandStatus({
      commandId: Number(req.params.commandId) || 0,
      status: req.body?.status,
      error: req.body?.error,
    });
    if (!command) return res.status(404).json({ error: "Command not found." });
    return res.json({ command });
  });

  router.get("/scheduler/status", (_req, res) => {
    return res.json(service.getSchedulerStatus());
  });

  router.post("/scheduler/config", (req, res) => {
    const status = service.updateSchedulerConfig({
      enabled: parseOptionalBoolean(req.body?.enabled),
      tickSeconds: req.body?.tickSeconds,
      maxMapsPerRun: req.body?.maxMapsPerRun,
    });
    return res.json(status);
  });

  router.post("/scheduler/run-now", async (req, res) => {
    const scheduleId = Number(req.body?.scheduleId) || 0;
    if (scheduleId > 0) {
      const result = await service.runScheduleNow({
        scheduleId,
        reason: req.body?.reason || "manual-single",
      });
      if (result.error) return res.status(400).json(result);
      return res.json(result);
    }
    const result = await service.runDueSchedules({
      reason: req.body?.reason || "manual-due",
    });
    if (result.error) return res.status(500).json(result);
    return res.json(result);
  });

  return router;
}

export { createOpsAdminRoutes };
