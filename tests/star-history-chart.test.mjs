import { describe, expect, it } from "vitest";
import { cumulativeStarHistory, renderHistory } from "../scripts/star-history-chart.mjs";

describe("cumulative star history", () => {
  it("accumulates stars by UTC day from creation through today and renders the total", () => {
    const days = cumulativeStarHistory(
      ["2026-10-01T23:59:59Z", "2026-10-02T00:00:00Z", "2026-10-02T18:00:00Z"],
      "2026-10-01T15:00:00Z",
      Date.parse("2026-10-03T12:00:00Z"),
    );

    expect(days).toEqual([
      { date: "2026-10-01", count: 1, total: 1 },
      { date: "2026-10-02", count: 2, total: 3 },
      { date: "2026-10-03", count: 0, total: 3 },
    ]);
    const svg = renderHistory("dark", "owner/repo", days, 3);
    expect(svg).toContain("Cumulative stars · 2026-10-01–2026-10-03");
    expect(svg).toContain("Star history");
    expect(svg).toContain("★ 3 stars");
    expect(svg).toContain('<polygon points="');
    expect(svg).toContain('<polyline points="');
    expect(svg).toContain('stroke="#3fb950"');
  });
});
