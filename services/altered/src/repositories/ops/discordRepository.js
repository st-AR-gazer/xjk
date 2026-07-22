import { clampInt, toIso, toText } from "../../../../shared/valueUtils.js";
import { boolToInt, normalizeCommandStatus, rowToDiscordCommand, serializeJson } from "./support.js";

function rowToDiscordConfig(row) {
  return {
    configId: Number(row.configId || 1),
    enabled: Boolean(row.enabled),
    botName: toText(row.botName) || "altered-bot",
    guildId: toText(row.guildId) || null,
    channelId: toText(row.channelId) || null,
    webhookUrl: toText(row.webhookUrl) || null,
    announceWrChanges: Boolean(row.announceWrChanges),
    mentionRoleId: toText(row.mentionRoleId) || null,
    footerText: toText(row.footerText) || null,
    updatedAt: toIso(row.updatedAt),
  };
}

class OpsDiscordRepository {
  constructor(db) {
    this.db = db;
  }

  ensureDefaultConfig(now) {
    this.db
      .prepare(
        `
        INSERT OR IGNORE INTO discord_bot_config (
          config_id,
          enabled,
          bot_name,
          guild_id,
          channel_id,
          webhook_url,
          announce_wr_changes,
          mention_role_id,
          footer_text,
          updated_at
        ) VALUES (1, 0, 'altered-bot', '', '', '', 1, '', '', ?)
        `
      )
      .run(now);
  }

  getDiscordBotConfig() {
    const row = this.db
      .prepare(
        `
        SELECT
          config_id AS configId,
          enabled AS enabled,
          bot_name AS botName,
          guild_id AS guildId,
          channel_id AS channelId,
          webhook_url AS webhookUrl,
          announce_wr_changes AS announceWrChanges,
          mention_role_id AS mentionRoleId,
          footer_text AS footerText,
          updated_at AS updatedAt
        FROM discord_bot_config
        WHERE config_id = 1
        LIMIT 1
        `
      )
      .get();
    return row ? rowToDiscordConfig(row) : null;
  }

  updateDiscordBotConfig(payload = {}) {
    const existing = this.getDiscordBotConfig();
    const now = new Date().toISOString();
    const merged = {
      enabled: payload.enabled === undefined ? Boolean(existing?.enabled) : Boolean(payload.enabled),
      botName: toText(payload.botName) || toText(existing?.botName) || "altered-bot",
      guildId: payload.guildId === undefined ? toText(existing?.guildId) : toText(payload.guildId),
      channelId: payload.channelId === undefined ? toText(existing?.channelId) : toText(payload.channelId),
      webhookUrl: payload.webhookUrl === undefined ? toText(existing?.webhookUrl) : toText(payload.webhookUrl),
      announceWrChanges:
        payload.announceWrChanges === undefined
          ? Boolean(existing?.announceWrChanges)
          : Boolean(payload.announceWrChanges),
      mentionRoleId:
        payload.mentionRoleId === undefined ? toText(existing?.mentionRoleId) : toText(payload.mentionRoleId),
      footerText: payload.footerText === undefined ? toText(existing?.footerText) : toText(payload.footerText),
    };
    this.db
      .prepare(
        `
        INSERT INTO discord_bot_config (
          config_id,
          enabled,
          bot_name,
          guild_id,
          channel_id,
          webhook_url,
          announce_wr_changes,
          mention_role_id,
          footer_text,
          updated_at
        ) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(config_id) DO UPDATE SET
          enabled = excluded.enabled,
          bot_name = excluded.bot_name,
          guild_id = excluded.guild_id,
          channel_id = excluded.channel_id,
          webhook_url = excluded.webhook_url,
          announce_wr_changes = excluded.announce_wr_changes,
          mention_role_id = excluded.mention_role_id,
          footer_text = excluded.footer_text,
          updated_at = excluded.updated_at
        `
      )
      .run(
        boolToInt(merged.enabled),
        merged.botName,
        merged.guildId,
        merged.channelId,
        merged.webhookUrl,
        boolToInt(merged.announceWrChanges),
        merged.mentionRoleId,
        merged.footerText,
        now
      );
    return this.getDiscordBotConfig();
  }

  enqueueDiscordCommand({ commandType, payload = {}, source = "ops-scheduler" }) {
    const safeType = toText(commandType);
    if (!safeType) return { error: "commandType is required." };
    const now = new Date().toISOString();
    const result = this.db
      .prepare(
        `
        INSERT INTO discord_bot_commands (
          status,
          command_type,
          payload_json,
          source,
          created_at
        ) VALUES (?, ?, ?, ?, ?)
        `
      )
      .run("queued", safeType, serializeJson(payload), toText(source) || "ops-scheduler", now);
    return { commandId: Number(result.lastInsertRowid || 0) };
  }

  listDiscordCommands({ status = "", limit = 200 } = {}) {
    const safeStatus = normalizeCommandStatus(status, "");
    return this.db
      .prepare(
        `
        SELECT
          command_id AS commandId,
          status,
          command_type AS commandType,
          payload_json AS payloadJson,
          source,
          created_at AS createdAt,
          processed_at AS processedAt,
          error
        FROM discord_bot_commands
        WHERE (? = '' OR status = ?)
        ORDER BY command_id DESC
        LIMIT ?
        `
      )
      .all(safeStatus, safeStatus, clampInt(limit, { min: 1, max: 5000, fallback: 200 }))
      .map(rowToDiscordCommand);
  }

  updateDiscordCommandStatus({ commandId, status, error = "" }) {
    const safeStatus = normalizeCommandStatus(status, "queued");
    const now = new Date().toISOString();
    this.db
      .prepare(
        `
        UPDATE discord_bot_commands
        SET
          status = ?,
          processed_at = CASE WHEN ? = 'queued' THEN NULL ELSE ? END,
          error = CASE WHEN ? = '' THEN NULL ELSE ? END
        WHERE command_id = ?
        `
      )
      .run(safeStatus, safeStatus, now, toText(error), toText(error), Number(commandId) || 0);
    const row = this.db
      .prepare(
        `
        SELECT
          command_id AS commandId,
          status,
          command_type AS commandType,
          payload_json AS payloadJson,
          source,
          created_at AS createdAt,
          processed_at AS processedAt,
          error
        FROM discord_bot_commands
        WHERE command_id = ?
        LIMIT 1
        `
      )
      .get(Number(commandId) || 0);
    return row ? rowToDiscordCommand(row) : null;
  }

  countQueuedCommands() {
    return Number(
      this.db.prepare("SELECT COUNT(*) AS count FROM discord_bot_commands WHERE status = 'queued'").get()?.count || 0
    );
  }
}

export { OpsDiscordRepository };
