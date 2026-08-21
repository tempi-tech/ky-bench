import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const round3 = (value) => Math.round(value * 1000) / 1000;
const meanOf = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;

const records = fs.readdirSync(path.join(here, "matches"))
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => JSON.parse(fs.readFileSync(path.join(here, "matches", name), "utf8")))
  .filter((record) => record.summary?.roundsPlayed === 1 && record.summary.blind);

const seatRows = records.flatMap((record) => Object.entries(record.summary.seats).map(([player, model]) => ({
  model,
  legibility: record.summary.metrics[player].legibility,
  decoding: record.summary.metrics[player].decoding,
  inconsistentPlays: record.summary.metrics[player].inconsistentPlays,
})));

const standings = [...new Set(seatRows.map((row) => row.model))]
  .map((model) => {
    const rows = seatRows.filter((row) => row.model === model);
    const legibility = round3(meanOf(rows.map((row) => row.legibility)));
    const decoding = round3(meanOf(rows.map((row) => row.decoding)));
    return {
      model,
      games: rows.length,
      legibility,
      decoding,
      overall: round3((legibility + decoding) / 2),
      inconsistentPlays: rows.reduce((sum, row) => sum + row.inconsistentPlays, 0),
    };
  })
  .sort((a, b) => b.overall - a.overall);

const games = records.map((record) => ({
  id: record.summary.game,
  kind: record.summary.kind,
  playedAt: record.updatedAt,
  theme: record.summary.theme,
  players: record.playerCount,
  mistakes: record.summary.mistakes,
  perfect: record.summary.mistakes === 0,
  seats: Object.fromEntries(Object.entries(record.summary.seats).map(([player, model]) => [player, {
    model,
    number: record.rounds[0].numbers[player],
    clue: record.rounds[0].clues[player],
    legibility: round3(record.summary.metrics[player].legibility),
    decoding: round3(record.summary.metrics[player].decoding),
  }])),
  plays: record.rounds[0].plays.map(({ player, number, kind, ok }) => ({ player, number, kind, ok })),
  notes: record.summary.notes ?? [],
}));

const doc = {
  bench: "KY-Bench",
  game: "Same Scale",
  tagline: "Can LLMs read the room?",
  source: "https://github.com/tempi-tech/ky-bench",
  metricsNote: "skill = 1 - MAE / 33.3 (0 = random guessing, 1 = perfect); see METHOD.md",
  generatedAt: new Date().toISOString(),
  standings,
  games,
};

fs.writeFileSync(path.join(here, "standings.json"), `${JSON.stringify(doc, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, games: games.length, models: standings.length })}\n`);
