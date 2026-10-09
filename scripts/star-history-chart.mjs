const DAY_MS = 86_400_000;
const WINDOW_DAYS = 60;

export function dailyStarGrowth(starredAt, createdAt, now = Date.now()) {
  const firstDay = Math.floor(new Date(createdAt).getTime() / DAY_MS);
  const lastDay = Math.max(firstDay, Math.floor(now / DAY_MS));
  const startDay = Math.max(firstDay, lastDay - WINDOW_DAYS + 1);
  const counts = new Map();

  for (const timestamp of starredAt) {
    const day = Math.floor(new Date(timestamp).getTime() / DAY_MS);
    if (day >= startDay && day <= lastDay) counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  return Array.from({ length: lastDay - startDay + 1 }, (_, index) => {
    const day = startDay + index;
    return { date: new Date(day * DAY_MS).toISOString().slice(0, 10), count: counts.get(day) ?? 0 };
  });
}

export function renderHistory(theme, repository, days) {
  const dark = theme === "dark";
  const colors = dark
    ? { bg: "#0d1117", grid: "#30363d", text: "#e6edf3", muted: "#8b949e", line: "#3fb950" }
    : { bg: "#ffffff", grid: "#d8dee4", text: "#24292f", muted: "#57606a", line: "#1a7f37" };
  const width = 840;
  const height = 360;
  const left = 68;
  const right = 28;
  const top = 70;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const total = days.reduce((sum, day) => sum + day.count, 0);
  const maxY = Math.max(4, Math.ceil(Math.max(...days.map((day) => day.count)) / 4) * 4);

  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = top + (chartHeight * index) / 4;
    const label = (maxY * (4 - index)) / 4;
    return `<line x1="${left}" y1="${y}" x2="${left + chartWidth}" y2="${y}" stroke="${colors.grid}" stroke-width="1"/><text x="${left - 12}" y="${y + 4}" text-anchor="end" fill="${colors.muted}" font-size="12">${label}</text>`;
  }).join("");

  const labelIndexes = [...new Set([0, Math.round((days.length - 1) / 3), Math.round((days.length - 1) * 2 / 3), days.length - 1])];
  const dateLabels = labelIndexes.map((index) => {
    const x = left + ((index + 0.5) / days.length) * chartWidth;
    const anchor = index === 0 ? "start" : index === days.length - 1 ? "end" : "middle";
    return `<text x="${x.toFixed(1)}" y="${height - 18}" text-anchor="${anchor}" fill="${colors.muted}" font-size="12">${days[index].date}</text>`;
  }).join("");

  const slotWidth = chartWidth / days.length;
  const points = days.map((day, index) => ({
    x: left + (index + 0.5) * slotWidth,
    y: top + chartHeight - (day.count / maxY) * chartHeight,
  }));
  const line = `<polyline points="${points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}" fill="none" stroke="${colors.line}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
  const markers = points.map(({ x, y }, index) => days[index].count > 0
    ? `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${colors.line}"/>`
    : "").join("");
  const emptyState = total === 0
    ? `<text x="${left + chartWidth / 2}" y="${top + chartHeight / 2}" text-anchor="middle" fill="${colors.muted}" font-size="16">No new stars in this period</text>`
    : line + markers;
  const summary = `New stars per UTC day · ${days[0].date}–${days.at(-1).date}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(repository)} daily star growth: ${summary}"><rect width="${width}" height="${height}" rx="12" fill="${colors.bg}"/><text x="${left}" y="34" fill="${colors.text}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="20" font-weight="700">Daily star growth</text><text x="${left}" y="55" fill="${colors.muted}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">${escapeXml(repository)} · ${summary}</text><g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${grid}${dateLabels}${emptyState}</g></svg>\n`;
}

function escapeXml(value) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&apos;",
  })[character]);
}
