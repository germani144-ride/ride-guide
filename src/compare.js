// What the comparison screen highlights, from the cars' results. Plain functions, no DOM.

// For each result: whether it is the cheapest per month, and how much more per month it costs
// than the cheapest. Also the parts of all cars added up, for one shared legend.
export function compareResults(results) {
  const priced = results.filter(r => r.perMonth > 0);
  const bestMonth = priced.length ? Math.min(...priced.map(r => r.perMonth)) : 0;
  const mergedParts = {};
  for (const r of results)
    for (const [k, v] of Object.entries(r.parts)) mergedParts[k] = (mergedParts[k] || 0) + v;
  return {
    cheapest: results.map(r => priced.length > 0 && r.perMonth === bestMonth),
    extraPerMonth: results.map(r => r.perMonth - bestMonth),
    mergedParts,
  };
}
