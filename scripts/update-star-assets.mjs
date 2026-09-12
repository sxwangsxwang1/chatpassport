import { mkdir, writeFile } from "node:fs/promises";

const token = process.env.GITHUB_TOKEN;
const repository = process.env.GITHUB_REPOSITORY;

if (!token || !repository) {
  throw new Error("GITHUB_TOKEN and GITHUB_REPOSITORY are required.");
}

const [owner, name] = repository.split("/");
if (!owner || !name) throw new Error("GITHUB_REPOSITORY must use owner/name format.");

const starredAt = [];
let createdAt = "";
let starCount = 0;
let cursor = null;

do {
  const response = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "ChatPassport-Star-History",
    },
    body: JSON.stringify({
      query: `
        query StarHistory($owner: String!, $name: String!, $cursor: String) {
          repository(owner: $owner, name: $name) {
            createdAt
            stargazerCount
            stargazers(first: 100, after: $cursor) {
              edges { starredAt }
              pageInfo { hasNextPage endCursor }
            }
          }
        }
      `,
      variables: { owner, name, cursor },
    }),
  });

  if (!response.ok) throw new Error(`GitHub GraphQL returned ${response.status}.`);
  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error) => error.message).join("; "));
  }

  const repo = payload.data?.repository;
  if (!repo) throw new Error(`Repository ${repository} was not found.`);
  createdAt = repo.createdAt;
  starCount = repo.stargazerCount;
  starredAt.push(...repo.stargazers.edges.map((edge) => edge.starredAt));
  cursor = repo.stargazers.pageInfo.hasNextPage ? repo.stargazers.pageInfo.endCursor : null;
} while (cursor);

starredAt.sort();
await mkdir("assets", { recursive: true });
await Promise.all([
  writeFile("assets/star-history.svg", renderHistory("light")),
  writeFile("assets/star-history-dark.svg", renderHistory("dark")),
  writeFile("assets/star-badge.svg", renderBadge()),
]);

function renderHistory(theme) {
  const dark = theme === "dark";
  const colors = dark
    ? { bg: "#0d1117", grid: "#30363d", text: "#e6edf3", muted: "#8b949e", line: "#58a6ff", fill: "#58a6ff" }
    : { bg: "#ffffff", grid: "#d8dee4", text: "#24292f", muted: "#57606a", line: "#0969da", fill: "#0969da" };
  const width = 840;
  const height = 360;
  const left = 68;
  const right = 28;
  const top = 70;
  const bottom = 48;
  const chartWidth = width - left - right;
  const chartHeight = height - top - bottom;
  const startTime = new Date(createdAt).getTime();
  const endTime = Math.max(Date.now(), startTime + 86_400_000);
  const maxY = Math.max(1, starCount);
  const x = (time) => left + ((time - startTime) / (endTime - startTime)) * chartWidth;
  const y = (count) => top + chartHeight - (count / maxY) * chartHeight;

  const points = [{ time: startTime, count: 0 }];
  starredAt.forEach((date, index) => points.push({ time: new Date(date).getTime(), count: index + 1 }));
  points.push({ time: endTime, count: starCount });
  const polyline = points.map((point) => `${x(point.time).toFixed(1)},${y(point.count).toFixed(1)}`).join(" ");
  const area = `${left},${top + chartHeight} ${polyline} ${left + chartWidth},${top + chartHeight}`;

  const horizontalGrid = Array.from({ length: 5 }, (_, index) => {
    const ratio = index / 4;
    const gridY = top + chartHeight * ratio;
    const label = Math.round(maxY * (1 - ratio));
    return `<line x1="${left}" y1="${gridY}" x2="${left + chartWidth}" y2="${gridY}" stroke="${colors.grid}" stroke-width="1"/><text x="${left - 12}" y="${gridY + 4}" text-anchor="end" fill="${colors.muted}" font-size="12">${label}</text>`;
  }).join("");

  const dateLabels = Array.from({ length: 4 }, (_, index) => {
    const ratio = index / 3;
    const time = startTime + (endTime - startTime) * ratio;
    const label = new Date(time).toISOString().slice(0, 10);
    return `<text x="${left + chartWidth * ratio}" y="${height - 18}" text-anchor="${index === 0 ? "start" : index === 3 ? "end" : "middle"}" fill="${colors.muted}" font-size="12">${label}</text>`;
  }).join("");

  const emptyState = starCount === 0
    ? `<text x="${left + chartWidth / 2}" y="${top + chartHeight / 2 - 8}" text-anchor="middle" fill="${colors.text}" font-size="20" font-weight="600">No stars yet</text><text x="${left + chartWidth / 2}" y="${top + chartHeight / 2 + 20}" text-anchor="middle" fill="${colors.muted}" font-size="14">Be the first to star ChatPassport ⭐</text>`
    : `<polygon points="${area}" fill="${colors.fill}" fill-opacity="0.10"/><polyline points="${polyline}" fill="none" stroke="${colors.line}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${x(endTime)}" cy="${y(starCount)}" r="5" fill="${colors.line}"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(repository)} star history: ${starCount} stars"><rect width="${width}" height="${height}" rx="12" fill="${colors.bg}"/><text x="${left}" y="34" fill="${colors.text}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="20" font-weight="700">Star History</text><text x="${left}" y="55" fill="${colors.muted}" font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif" font-size="13">${escapeXml(repository)} · ${starCount} ${starCount === 1 ? "star" : "stars"}</text><g font-family="-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif">${horizontalGrid}${dateLabels}${emptyState}</g></svg>\n`;
}

function renderBadge() {
  const count = String(starCount);
  const rightWidth = Math.max(28, count.length * 8 + 16);
  const width = 45 + rightWidth;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="20" role="img" aria-label="stars: ${count}"><linearGradient id="s" x2="0" y2="100%"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-opacity=".12"/></linearGradient><clipPath id="r"><rect width="${width}" height="20" rx="3"/></clipPath><g clip-path="url(#r)"><rect width="45" height="20" fill="#555"/><rect x="45" width="${rightWidth}" height="20" fill="#176044"/><rect width="${width}" height="20" fill="url(#s)"/></g><g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="11"><text x="22.5" y="15">stars</text><text x="${45 + rightWidth / 2}" y="15">${count}</text></g></svg>\n`;
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
