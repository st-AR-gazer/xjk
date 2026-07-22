const DEFAULT_COLORS = Object.freeze(["#0033CC", "#33FFFF", "#FF33CC", "#CC33FF", "#33CCFF"]);

const colorizerState = {
  colors: DEFAULT_COLORS.slice(0, 2),
  includeEscapeCharacters: false,
  isColorCardOpen: false,
  isOptionsCardOpen: false,
};

export { colorizerState, DEFAULT_COLORS };
