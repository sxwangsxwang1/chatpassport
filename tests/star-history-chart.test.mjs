import { describe, expect, it } from "vitest";
import { dailyStarGrowth, renderHistory } from "../scripts/star-history-chart.mjs";

describe("daily star growth", () => {
  it("groups stars by UTC day and keeps zero-growth days", () => {
    const days = dailyStarGrowth(
      ["2026-10-01T23:59:59Z", "2026-10-02T00:00:00Z", "2026-10-02T18:00:00Z"],
      "2026-10-01T15:00:00Z",
      Date.parse("2026-10-03T12:00:00Z"),
    );

    expect(days).toEqual([
      { date: "2026-10-01", count: 1 },
      { date: "2026-10-02", count: 2 },
      { date: "2026-10-03", count: 0 },
    ]);
    const svg = renderHistory("dark", "owner/repo", days);
    expect(svg).toContain("New stars per UTC day · 2026-10-01–2026-10-03");
    expect(svg).toContain("Daily star growth");
    expect(svg).toContain('<polyline points="');
    expect(svg).toContain('stroke="#3fb950"');
    expect(svg).not.toContain('<rect x="');
  });
});
