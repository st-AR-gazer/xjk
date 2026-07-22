function withDepth(items) {
  const sorted = [...items].sort((left, right) => String(left.path || "").localeCompare(String(right.path || "")));
  return sorted.map((endpoint) => {
    const endpointPath = String(endpoint.path || "");
    const depth = sorted.filter((candidate) => {
      const candidatePath = String(candidate.path || "");
      return candidatePath !== endpointPath && endpointPath.startsWith(`${candidatePath}/`);
    }).length;
    return { ep: endpoint, depth };
  });
}

export { withDepth };
