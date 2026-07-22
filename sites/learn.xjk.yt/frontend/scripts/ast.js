function normalizeAst(ast = []) {
  if (Array.isArray(ast)) return ast;
  if (Array.isArray(ast?.children)) return ast.children;
  if (Array.isArray(ast?.body)) return ast.body;
  return [];
}

function inlineAstText(nodes = []) {
  const entries = Array.isArray(nodes) ? nodes : [nodes];
  return entries
    .map((node) => {
      if (!node) return "";
      if (typeof node === "string") return node;
      if (["text", "code_inline", "inlineCode", "code"].includes(node.type)) return String(node.value || "");
      if (node.type === "image" || node.alt) return String(node.alt || "");
      if (node.type === "wikiLink") return String(node.label || node.slug || "");
      if (node.children) return inlineAstText(node.children);
      return String(node.value || node.text || "");
    })
    .join("");
}

export { inlineAstText, normalizeAst };
