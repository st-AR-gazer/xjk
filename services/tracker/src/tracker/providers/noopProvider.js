class NoopTrackerProvider {
  constructor() {
    this.name = "noop";
  }

  async checkMap() {
    return {
      changed: false,
      source: this.name,
      note: "provider-noop",
    };
  }

  async checkMapLeaderboard() {
    return {
      source: this.name,
      note: "provider-noop",
      entries: [],
    };
  }
}

export { NoopTrackerProvider };
