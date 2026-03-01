const SIM_PLAYERS = [
  "Xephi",
  "Nyota",
  "Sphynx",
  "Ari",
  "Kizaru",
  "Lynx",
  "Toki",
  "Kov",
  "Mira",
  "Polaris",
  "Sora",
  "Nova",
  "Haku",
  "Valk",
];

function pickRandom(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const index = Math.floor(Math.random() * list.length);
  return list[index];
}

class SimulatedTrackerProvider {
  constructor({ changeChance = 0.18 } = {}) {
    this.name = "simulated";
    this.changeChance = Math.min(1, Math.max(0, Number(changeChance) || 0.18));
  }

  async checkMap(map) {
    const currentWr = Math.max(1, Number(map?.wrMs || 0));
    if (!currentWr || currentWr <= 20000) {
      return {
        changed: false,
        source: this.name,
        note: "wr-floor",
      };
    }

    const shouldChange = Math.random() < this.changeChance;
    if (!shouldChange) {
      return {
        changed: false,
        source: this.name,
        note: "no-change",
      };
    }

    const gainMs = 35 + Math.floor(Math.random() * 250);
    const wrMs = Math.max(20000, currentWr - gainMs);
    const currentHolder = String(map?.wrHolder || "").trim();
    const holderPool = SIM_PLAYERS.filter((name) => name !== currentHolder);
    const displayName = pickRandom(holderPool) || currentHolder || "Unknown";
    const accountId = `sim-${displayName.toLowerCase()}`;

    return {
      changed: wrMs < currentWr,
      source: this.name,
      note: `improved-${gainMs}ms`,
      wrMs,
      displayName,
      accountId,
    };
  }
}

export { SimulatedTrackerProvider };
