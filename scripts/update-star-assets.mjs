import { mkdir, writeFile } from "node:fs/promises";
import { dailyStarGrowth, renderHistory } from "./star-history-chart.mjs";

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
const days = dailyStarGrowth(starredAt, createdAt);
await mkdir("assets", { recursive: true });
await Promise.all([
  writeFile("assets/star-history.svg", renderHistory("light", repository, days)),
  writeFile("assets/star-history-dark.svg", renderHistory("dark", repository, days)),
  writeFile("assets/star-badge.svg", renderBadge()),
]);

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
