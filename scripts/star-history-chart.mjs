const DAY_MS = 86_400_000;

export function cumulativeStarHistory(starredAt, createdAt, now = Date.now()) {
  const createdMs = Date.parse(createdAt);
  const firstStarMs = starredAt.length ? Math.min(...starredAt.map((ts) => Date.parse(ts))) : createdMs;
  const firstDay = Math.floor(Math.min(createdMs, firstStarMs) / DAY_MS);
  const lastDay = Math.max(firstDay, Math.floor(now / DAY_MS));
  const counts = new Map();

  for (const timestamp of starredAt) {
    const day = Math.min(lastDay, Math.floor(Date.parse(timestamp) / DAY_MS));
    if (day >= firstDay) counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  let running = 0;
  return Array.from({ length: lastDay - firstDay + 1 }, (_, index) => {
    const day = firstDay + index;
    const count = counts.get(day) ?? 0;
    running += count;
    return { date: new Date(day * DAY_MS).toISOString().slice(0, 10), count, total: running };
  });
}

function niceAxisMax(value) {
  if (value <= 4) return 4;
  const rawStep = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 2.5 ? 2.5 : normalized <= 5 ? 5 : 10;
  return Math.ceil(value / (step * magnitude)) * step * magnitude;
}

export function renderHistory(theme, repository, days, totalStars = days.at(-1)?.total ?? 0) {
  const dark = theme === "dark";
  const colors = dark
    ? {
      bg: "#0d1117", border: "#30363d", grid: "#21262d", text: "#e6edf3", muted: "#8b949e",
      line: "#3fb950", areaTop: "#3fb950", areaBottom: "#3fb950",
      badgeBg: "#262115", badgeBorder: "#5c481c", badgeText: "#e3b341",
    }
    : {
      bg: "#ffffff", border: "#e3dfd2", grid: "#ece9df", text: "#17201c", muted: "#636b66",
      line: "#164c3a", areaTop: "#1c7255", areaBottom: "#1c7255",
      badgeBg: "#fdf6e4", badgeBorder: "#e8d29d", badgeText: "#8a5d14",
    };

  const width = 840;
  const height = 360;
  const left = 68;
  const right = 36;
  const top = 76;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const peak = Math.max(totalStars, ...days.map((day) => day.total));
  const maxY = niceAxisMax(peak);

  const grid = Array.from({ length: 5 }, (_, index) => {
    const y = top + (chartHeight * index) / 4;
    const label = Math.round((maxY * (4 - index)) / 4);
    return `<line x1="${left}" y1="${y}" x2="${left + chartWidth}" y2="${y}" stroke="${colors.grid}" stroke-width="1"/><text x="${left - 12}" y="${y + 4}" text-anchor="end" fill="${colors.muted}" font-size="12">${label.toLocaleString("en-US")}</text>`;
  }).join("");

  const labelIndexes = [...new Set([0, Math.round((days.length - 1) / 3), Math.round((days.length - 1) * 2 / 3), days.length - 1])];
  const xFor = (index) => days.length === 1
    ? left + chartWidth / 2
    : left + (index / (days.length - 1)) * chartWidth;

  const dateLabels = labelIndexes.map((index) => {
    const x = xFor(index);
    const anchor = index === 0 ? "start" : index === days.length - 1 ? "end" : "middle";
    return `<text x="${x.toFixed(1)}" y="${height - 16}" text-anchor="${anchor}" fill="${colors.muted}" font-size="12">${days[index].date}</text>`;
  }).join("");

  const points = days.map((day, index) => ({
    x: xFor(index),
    y: top + chartHeight - (day.total / maxY) * chartHeight,
  }));

  const polylinePoints = points.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const baselineY = (top + chartHeight).toFixed(1);
  const firstPoint = points[0];
  const lastPoint = points.at(-1);
  const areaPoints = `${firstPoint.x.toFixed(1)},${baselineY} ${polylinePoints} ${lastPoint.x.toFixed(1)},${baselineY}`;

  const gradId = `star-area-${theme}`;
  const chartSeries = peak === 0
    ? `<text x="${left + chartWidth / 2}" y="${top + chartHeight / 2}" text-anchor="middle" fill="${colors.muted}" font-size="16">No stars recorded yet</text>`
    : `<polygon points="${areaPoints}" fill="url(#${gradId})"/><polyline points="${polylinePoints}" fill="none" stroke="${colors.line}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="8" fill="${colors.line}" fill-opacity="0.2"/><circle cx="${lastPoint.x.toFixed(1)}" cy="${lastPoint.y.toFixed(1)}" r="4" fill="${colors.line}"/>`;

  const badgeLabel = `★ ${totalStars.toLocaleString("en-US")} ${totalStars === 1 ? "star" : "stars"}`;
  const badgeWidth = Math.max(98, badgeLabel.length * 8 + 26);
  const badgeX = width - right - badgeWidth;
  const badge = `<rect x="${badgeX}" y="20" width="${badgeWidth}" height="30" rx="15" fill="${colors.badgeBg}" stroke="${colors.badgeBorder}" stroke-width="1"/><text x="${badgeX + badgeWidth / 2}" y="40" text-anchor="middle" fill="${colors.badgeText}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13" font-weight="700">${escapeXml(badgeLabel)}</text>`;

  const summary = `Cumulative stars · ${days[0].date}–${days.at(-1).date}`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(repository)} star history: ${totalStars} stars, ${summary}"><defs><linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${colors.areaTop}" stop-opacity="${dark ? "0.28" : "0.18"}"/><stop offset="100%" stop-color="${colors.areaBottom}" stop-opacity="0.01"/></linearGradient></defs><rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="12" fill="${colors.bg}" stroke="${colors.border}"/><text x="${left}" y="35" fill="${colors.text}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="20" font-weight="700">Star history</text><text x="${left}" y="56" fill="${colors.muted}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">${escapeXml(repository)} · ${summary}</text>${badge}<g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${grid}${dateLabels}${chartSeries}</g></svg>\n`;
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
