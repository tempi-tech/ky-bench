#!/usr/bin/env node

import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const matchesDir = path.join(here, "matches");
const uiDir = path.join(here, "ui");
const defaultMatchId = "current";
const randomBaselineError = 100 / 3;

const fail = (message, code = 1) => {
  process.stderr.write(`${message}\n`);
  process.exit(code);
};

const argsOf = (argv) => {
  const state = argv.reduce((acc, token, index) => {
    if (acc.skip.has(index)) {
      return acc;
    }
    if (acc.raw) {
      acc.rest.push(token);
      return acc;
    }
    if (token === "--") {
      return { ...acc, raw: true };
    }
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        acc.flags[key] = true;
        return acc;
      }
      acc.flags[key] = next;
      acc.skip.add(index + 1);
      return acc;
    }
    acc.rest.push(token);
    return acc;
  }, { rest: [], flags: {}, skip: new Set(), raw: false });
  return { rest: state.rest, flags: state.flags };
};

const nowIso = () => new Date().toISOString();

const defaultThemes = ["怖いもの", "重いもの", "もらって嬉しいもの", "強そうな生き物", "朝に食べたいもの度", "人生で大事なもの"];

const playerIdsOf = (count) => Array.from({ length: count }, (_, index) => `P${index + 1}`);

const drawNumbers = (count) => {
  const pool = Array.from({ length: 100 }, (_, index) => index + 1);
  return Array.from({ length: count }, () => pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
};

const newRound = ({ index, theme, players }) => {
  const numbers = drawNumbers(players.length);
  return {
    index,
    theme,
    numbers: Object.fromEntries(players.map((player, at) => [player, numbers[at]])),
    clues: {},
    estimates: {},
    estimates2: {},
    said: [],
    open: false,
    turn: players[(index - 1) % players.length],
    passStreak: 0,
    passForbidden: false,
    plays: [],
    actions: [],
    mistakes: 0,
  };
};

const createMatch = ({ id, playerCount, rounds, themes, discussion }) => {
  if (!Number.isInteger(playerCount) || playerCount < 2 || playerCount > 6) {
    throw new Error("players must be an integer from 2 to 6");
  }
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 12) {
    throw new Error("rounds must be an integer from 1 to 12");
  }
  const players = playerIdsOf(playerCount);
  return {
    id,
    title: `${playerCount} players · ${rounds} ${rounds === 1 ? "round" : "rounds"}`,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: "playing",
    playerCount,
    totalRounds: rounds,
    themes,
    players: Object.fromEntries(players.map((player, index) => [player, { name: `Player ${index + 1}` }])),
    discussion,
    incidents: [],
    rounds: [newRound({ index: 1, theme: themes[0], players })],
  };
};

const matchPath = (id) => path.join(matchesDir, `${id}.json`);

const readMatch = (id) => {
  const file = matchPath(id);
  if (!fs.existsSync(file)) {
    throw new Error(`match not found: ${id}`);
  }
  return JSON.parse(fs.readFileSync(file, "utf8"));
};

const writeMatch = (match) => {
  fs.mkdirSync(matchesDir, { recursive: true });
  const file = matchPath(match.id);
  const tmp = `${file}.tmp`;
  const next = { ...match, updatedAt: nowIso() };
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
  fs.renameSync(tmp, file);
  return next;
};

const playersOf = (match) => Object.keys(match.players);

const currentRoundOf = (match) => match.rounds[match.rounds.length - 1];

const unplayedOf = (round) => {
  const done = new Set(round.plays.map((play) => play.player));
  return Object.keys(round.numbers).filter((player) => !done.has(player));
};

const announceTotalOf = (match) => (match.discussion?.enabled ? playersOf(match).length : 0);

const talkTotalOf = (match) => playersOf(match).length * (match.discussion?.cycles ?? 0);

const talkTurnOf = ({ match, round }) => playersOf(match)[round.said.length % playersOf(match).length];

const phaseOf = ({ match, round }) => {
  const players = playersOf(match);
  if (match.status === "over") {
    return "over";
  }
  if (players.some((player) => round.clues[player] === undefined)) {
    return "clue";
  }
  if (players.some((player) => round.estimates[player] === undefined)) {
    return "estimate";
  }
  if (match.discussion?.enabled && !round.open) {
    return "hold";
  }
  if (match.discussion?.enabled && round.said.length < announceTotalOf(match)) {
    return "announce";
  }
  if (match.discussion?.enabled && round.said.length < announceTotalOf(match) + talkTotalOf(match)) {
    return "discussion";
  }
  if (match.discussion?.enabled && players.some((player) => round.estimates2[player] === undefined)) {
    return "estimate2";
  }
  if (unplayedOf(round).length > 0) {
    return "order";
  }
  return "done";
};

const needOf = ({ match, player }) => {
  const round = currentRoundOf(match);
  const phase = phaseOf({ match, round });
  if (phase === "over") {
    return "over";
  }
  if (phase === "clue") {
    return round.clues[player] === undefined ? "clue" : "waiting";
  }
  if (phase === "estimate") {
    return round.estimates[player] === undefined ? "guess" : "waiting";
  }
  if (phase === "announce") {
    return talkTurnOf({ match, round }) === player ? "announce" : "waiting";
  }
  if (phase === "discussion") {
    return talkTurnOf({ match, round }) === player ? "discuss" : "waiting";
  }
  if (phase === "estimate2") {
    return round.estimates2[player] === undefined ? "guess" : "waiting";
  }
  if (phase === "order") {
    return round.turn === player ? "turn" : "waiting";
  }
  return "waiting";
};

const playerViewOf = ({ match, player }) => {
  const round = currentRoundOf(match);
  const need = needOf({ match, player });
  return {
    id: match.id,
    status: match.status,
    round: round.index,
    totalRounds: match.totalRounds,
    theme: round.theme,
    need,
    you: { player, number: round.numbers[player] },
    others: playersOf(match).filter((other) => other !== player),
    clues: round.clues,
    plays: round.plays,
    room: match.discussion?.enabled ? match.discussion.room : undefined,
    mustPlay: need === "turn" && round.passForbidden,
    mistakes: match.rounds.reduce((sum, entry) => sum + entry.mistakes, 0),
  };
};

const spectatorViewOf = ({ match, full }) => {
  const round = currentRoundOf(match);
  const base = {
    id: match.id,
    title: match.title,
    status: match.status,
    round: round.index,
    totalRounds: match.totalRounds,
    theme: round.theme,
    phase: phaseOf({ match, round }),
    turn: round.turn,
    clues: round.clues,
    plays: round.plays,
    mistakes: match.rounds.reduce((sum, entry) => sum + entry.mistakes, 0),
    players: match.players,
    incidents: match.incidents,
    updatedAt: match.updatedAt,
  };
  if (!full) {
    return base;
  }
  return { ...base, numbers: round.numbers, estimates: round.estimates, rounds: match.rounds };
};

const submitClue = ({ match, player, text }) => {
  const round = currentRoundOf(match);
  if (phaseOf({ match, round }) !== "clue") {
    throw new Error("not in the clue phase");
  }
  if (round.clues[player] !== undefined) {
    throw new Error("clue already submitted");
  }
  const clean = text.trim();
  if (!clean) {
    throw new Error("clue must not be empty");
  }
  if (/[0-9０-９]/.test(clean)) {
    match.incidents.push({ player, kind: "digit-clue", round: round.index, at: nowIso() });
    writeMatch(match);
    throw new Error("clue must not contain digits — express the magnitude through the theme");
  }
  round.clues[player] = clean;
  return match;
};

const submitGuess = ({ match, player, pairs }) => {
  const round = currentRoundOf(match);
  const phase = phaseOf({ match, round });
  if (phase !== "estimate" && phase !== "estimate2") {
    throw new Error("not in an estimate phase");
  }
  const target = phase === "estimate" ? round.estimates : round.estimates2;
  if (target[player] !== undefined) {
    throw new Error("estimates already submitted");
  }
  const others = playersOf(match).filter((other) => other !== player);
  const parsed = Object.fromEntries(pairs.map((pair) => {
    const matchPair = pair.match(/^(P[1-9])=(\d{1,3})$/);
    if (!matchPair) {
      throw new Error(`invalid estimate: ${pair} (use P2=40)`);
    }
    return [matchPair[1], Number(matchPair[2])];
  }));
  for (const other of others) {
    const value = parsed[other];
    if (!Number.isInteger(value) || value < 1 || value > 100) {
      throw new Error(`estimate for ${other} must be an integer from 1 to 100`);
    }
  }
  if (Object.keys(parsed).length !== others.length) {
    throw new Error(`estimate exactly: ${others.join(", ")}`);
  }
  target[player] = parsed;
  return match;
};

const submitSaid = ({ match, player }) => {
  const round = currentRoundOf(match);
  const phase = phaseOf({ match, round });
  if (phase !== "announce" && phase !== "discussion") {
    throw new Error("not in a talking phase");
  }
  if (talkTurnOf({ match, round }) !== player) {
    throw new Error(`not your turn to speak (turn=${talkTurnOf({ match, round })})`);
  }
  round.said.push({ player, at: nowIso() });
  return match;
};

const nextTurnOf = ({ round, players, after }) => {
  const open = unplayedOf(round);
  const order = [...players.slice(players.indexOf(after) + 1), ...players.slice(0, players.indexOf(after) + 1)];
  return order.find((player) => open.includes(player)) ?? null;
};

const finishRoundIfDone = (match) => {
  const round = currentRoundOf(match);
  if (unplayedOf(round).length > 0) {
    return match;
  }
  if (round.index >= match.totalRounds) {
    return { ...match, status: "over" };
  }
  const theme = match.themes[round.index % match.themes.length];
  match.rounds.push(newRound({ index: round.index + 1, theme, players: playersOf(match) }));
  return match;
};

const submitTurn = ({ match, player, action }) => {
  const round = currentRoundOf(match);
  if (phaseOf({ match, round }) !== "order") {
    throw new Error("not in the order phase");
  }
  if (round.turn !== player) {
    throw new Error(`not your turn (you=${player}, turn=${round.turn})`);
  }
  const players = playersOf(match);
  round.actions = round.actions ?? [];
  round.actions.push({ player, action, at: nowIso() });
  if (action === "pass") {
    if (round.passForbidden) {
      throw new Error("pass is forbidden this cycle — you must play");
    }
    round.passStreak += 1;
    if (round.passStreak >= unplayedOf(round).length) {
      round.passForbidden = true;
    }
    round.turn = nextTurnOf({ round, players, after: player });
    return match;
  }
  const own = round.numbers[player];
  const skipped = unplayedOf(round)
    .filter((other) => other !== player && round.numbers[other] < own)
    .sort((left, right) => round.numbers[left] - round.numbers[right]);
  for (const other of skipped) {
    round.plays.push({ player: other, number: round.numbers[other], kind: "skipped", at: nowIso() });
  }
  round.plays.push({ player, number: own, kind: "played", ok: skipped.length === 0, at: nowIso() });
  round.mistakes += skipped.length;
  round.passStreak = 0;
  round.passForbidden = false;
  round.turn = nextTurnOf({ round, players, after: player });
  return finishRoundIfDone(match);
};

const waitFor = ({ id, player, timeoutSec }) => new Promise((resolve) => {
  const state = { settled: false, watcher: null, timer: null };
  const deadline = Date.now() + timeoutSec * 1000;
  const finish = (payload) => {
    if (state.settled) {
      return;
    }
    state.settled = true;
    clearInterval(state.timer);
    state.watcher?.close();
    resolve(payload);
  };
  const check = () => {
    if (state.settled) {
      return;
    }
    try {
      const match = readMatch(id);
      const need = needOf({ match, player });
      if (need !== "waiting") {
        finish({ ok: true, timeout: false, data: playerViewOf({ match, player }) });
        return;
      }
      if (Date.now() >= deadline) {
        finish({ ok: true, timeout: true, data: playerViewOf({ match, player }) });
      }
    } catch (error) {
      finish({ ok: false, error: error.message });
    }
  };
  fs.mkdirSync(matchesDir, { recursive: true });
  state.watcher = fs.watch(matchesDir, check);
  state.timer = setInterval(check, 250);
  check();
});

const reportOf = (match) => {
  const players = playersOf(match);
  const rounds = match.rounds.filter((round) => Object.keys(round.estimates).length === players.length);
  const errorsBy = (predicate) => Object.fromEntries(players.map((player) => {
    const samples = rounds.flatMap((round) => players
      .filter((other) => other !== player)
      .map((other) => predicate({ round, player, other }))
      .filter((value) => value !== null));
    const mae = samples.length ? samples.reduce((sum, value) => sum + Math.abs(value), 0) / samples.length : null;
    const bias = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : null;
    return [player, { samples: samples.length, mae, bias, skill: mae === null ? null : 1 - mae / randomBaselineError }];
  }));
  const estimatesOf = (round) => (
    Object.keys(round.estimates2 ?? {}).length === players.length ? round.estimates2 : round.estimates
  );
  const decodingBy = (source) => errorsBy(({ round, player, other }) => (
    source(round)[player]?.[other] === undefined ? null : source(round)[player][other] - round.numbers[other]
  ));
  const legibilityBy = (source) => errorsBy(({ round, player, other }) => (
    source(round)[other]?.[player] === undefined ? null : source(round)[other][player] - round.numbers[player]
  ));
  const decoding = decodingBy(estimatesOf);
  const legibility = legibilityBy(estimatesOf);
  const discussionGain = match.discussion?.enabled
    ? Object.fromEntries(players.map((player) => {
      const pre = decodingBy((round) => round.estimates)[player];
      const post = decodingBy((round) => round.estimates2 ?? {})[player];
      const preLeg = legibilityBy((round) => round.estimates)[player];
      const postLeg = legibilityBy((round) => round.estimates2 ?? {})[player];
      return [player, {
        decoding: pre.mae === null || post.mae === null ? null : pre.mae - post.mae,
        legibility: preLeg.mae === null || postLeg.mae === null ? null : preLeg.mae - postLeg.mae,
      }];
    }))
    : null;
  const inconsistentEventsOf = (round) => {
    const events = round.plays.reduce((acc, entry) => {
      if (entry.kind === "skipped") {
        acc.buffer.push(entry.player);
        return acc;
      }
      acc.list.push({ player: entry.player, unplayedBefore: [...acc.open] });
      acc.open = acc.open.filter((other) => other !== entry.player && !acc.buffer.includes(other));
      return { ...acc, buffer: [] };
    }, { list: [], open: Object.keys(round.numbers), buffer: [] });
    return events.list.filter(({ player, unplayedBefore }) => {
      const own = round.numbers[player];
      const estimates = estimatesOf(round)[player] ?? {};
      return unplayedBefore
        .filter((other) => other !== player)
        .some((other) => estimates[other] !== undefined && estimates[other] < own);
    });
  };
  const consistency = Object.fromEntries(players.map((player) => {
    const violations = rounds.flatMap((round) => inconsistentEventsOf(round)
      .filter((event) => event.player === player));
    return [player, { inconsistentPlays: violations.length }];
  }));
  return {
    mistakes: match.rounds.reduce((sum, round) => sum + round.mistakes, 0),
    perfectRounds: match.rounds.filter((round) => round.mistakes === 0 && unplayedOf(round).length === 0).length,
    roundsPlayed: match.rounds.length,
    decoding,
    legibility,
    discussionGain,
    consistency,
    incidents: match.incidents,
  };
};

const sendJson = ({ response, status, body }) => {
  const payload = `${JSON.stringify(body)}\n`;
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  response.end(payload);
};

const seatLabelOf = (seat) => {
  if (typeof seat === "string") {
    return seat;
  }
  if (typeof seat.display === "string") {
    return seat.display;
  }
  const redundant = typeof seat.model === "string" && typeof seat.agentType === "string" && seat.model.startsWith(seat.agentType);
  return [redundant ? null : seat.agentType, seat.model, seat.effort].filter(Boolean).join(" · ");
};

const seatsViewOf = (seatsPath) => {
  if (!seatsPath || !fs.existsSync(seatsPath)) {
    return null;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(seatsPath, "utf8"));
    const seats = parsed.seats ?? parsed;
    return Object.fromEntries(Object.entries(seats).map(([player, seat]) => [player, seatLabelOf(seat)]));
  } catch {
    return null;
  }
};

const talkViewOf = (talkPath) => {
  if (!talkPath || !fs.existsSync(talkPath)) {
    return { messages: [] };
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(talkPath, "utf8"));
    return { messages: Array.isArray(parsed.messages) ? parsed.messages : [] };
  } catch {
    return { messages: [] };
  }
};

const startServer = ({ matchId, port, key, talkPath, seatsPath }) => {
  const server = http.createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/index.html")) {
      const file = path.join(uiDir, "index.html");
      if (!fs.existsSync(file)) {
        response.writeHead(404);
        response.end("not found");
        return;
      }
      const body = fs.readFileSync(file);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(body);
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/state") {
      try {
        const full = Boolean(key) && url.searchParams.get("key") === key;
        const view = spectatorViewOf({ match: readMatch(matchId), full });
        sendJson({ response, status: 200, body: full ? { ...view, seats: seatsViewOf(seatsPath) } : view });
      } catch (error) {
        sendJson({ response, status: 404, body: { error: error.message } });
      }
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/talk") {
      sendJson({ response, status: 200, body: talkViewOf(talkPath) });
      return;
    }
    response.writeHead(404);
    response.end("not found");
  });
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`${JSON.stringify({ ok: true, url: `http://127.0.0.1:${port}`, match: matchId })}\n`);
  });
};

const assertEqual = (actual, expected, label) => {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${label}: expected ${right}, got ${left}`);
  }
};

const runSelftest = () => {
  const match = createMatch({ id: "selftest", playerCount: 3, rounds: 1, themes: ["テスト"] });
  const round = currentRoundOf(match);
  round.numbers = { P1: 20, P2: 55, P3: 80 };
  assertEqual(phaseOf({ match, round }), "clue", "opening phase");
  submitClue({ match, player: "P1", text: "すこし" });
  submitClue({ match, player: "P2", text: "なかなか" });
  const rejected = (() => {
    try {
      submitClue({ match, player: "P3", text: "だいたい９０くらい" });
      return false;
    } catch {
      return true;
    }
  })();
  assertEqual(rejected, true, "digit clue rejected");
  submitClue({ match, player: "P3", text: "かなり" });
  assertEqual(phaseOf({ match, round }), "estimate", "estimate phase");
  submitGuess({ match, player: "P1", pairs: ["P2=50", "P3=90"] });
  submitGuess({ match, player: "P2", pairs: ["P1=25", "P3=85"] });
  submitGuess({ match, player: "P3", pairs: ["P1=30", "P2=60"] });
  assertEqual(phaseOf({ match, round }), "order", "order phase");
  assertEqual(round.turn, "P1", "first turn");
  submitTurn({ match, player: "P1", action: "pass" });
  submitTurn({ match, player: "P2", action: "play" });
  assertEqual(round.mistakes, 1, "skip costs a mistake");
  assertEqual(round.plays.map((play) => play.player), ["P1", "P2"], "skipped then played");
  const finished = submitTurn({ match, player: "P3", action: "play" });
  assertEqual(finished.status, "over", "over after last card");
  const report = reportOf(finished);
  assertEqual(report.mistakes, 1, "report mistakes");
  assertEqual(report.decoding.P2.samples, 2, "decode samples");
  const talky = createMatch({
    id: "selftest",
    playerCount: 2,
    rounds: 1,
    themes: ["テスト"],
    discussion: { enabled: true, room: "talk_test", cycles: 1 },
  });
  const talkRound = currentRoundOf(talky);
  talkRound.numbers = { P1: 10, P2: 90 };
  submitClue({ match: talky, player: "P1", text: "すこし" });
  submitClue({ match: talky, player: "P2", text: "とても" });
  submitGuess({ match: talky, player: "P1", pairs: ["P2=70"] });
  submitGuess({ match: talky, player: "P2", pairs: ["P1=30"] });
  assertEqual(phaseOf({ match: talky, round: talkRound }), "hold", "hold before open");
  assertEqual(needOf({ match: talky, player: "P1" }), "waiting", "players wait during hold");
  talkRound.open = true;
  assertEqual(phaseOf({ match: talky, round: talkRound }), "announce", "announce phase");
  assertEqual(needOf({ match: talky, player: "P1" }), "announce", "P1 announces first");
  submitSaid({ match: talky, player: "P1" });
  submitSaid({ match: talky, player: "P2" });
  assertEqual(phaseOf({ match: talky, round: talkRound }), "discussion", "discussion after announce");
  assertEqual(needOf({ match: talky, player: "P1" }), "discuss", "P1 speaks first");
  submitSaid({ match: talky, player: "P1" });
  submitSaid({ match: talky, player: "P2" });
  assertEqual(phaseOf({ match: talky, round: talkRound }), "estimate2", "estimate2 after talk");
  submitGuess({ match: talky, player: "P1", pairs: ["P2=88"] });
  submitGuess({ match: talky, player: "P2", pairs: ["P1=12"] });
  assertEqual(phaseOf({ match: talky, round: talkRound }), "order", "order after estimate2");
  submitTurn({ match: talky, player: "P1", action: "play" });
  const talkyDone = submitTurn({ match: talky, player: "P2", action: "play" });
  const talkyReport = reportOf(talkyDone);
  assertEqual(talkyReport.discussionGain.P1.decoding, 18, "discussion gain");
  process.stdout.write("selftest ok\n");
};

const helpText = `referee — cooperative number-ordering bench

  node referee.mjs new [--players 3] [--rounds 1] [--themes a,b,c] [--id current]
                       [--discussion [--room talk_xxx] [--cycles 2]]
  node referee.mjs said --as P1 [--id current]
  node referee.mjs open [--id current]        (runner: lift the hold after estimates)
  node referee.mjs state [--id current] [--json]
  node referee.mjs wait --as P1 [--timeout 120] [--id current]
  node referee.mjs clue <text...> --as P1 [--id current]
  node referee.mjs guess P2=40 P3=75 --as P1 [--id current]
  node referee.mjs play --as P1 [--id current]
  node referee.mjs pass --as P1 [--id current]
  node referee.mjs report [--id current]
  node referee.mjs serve [--id current] [--port 8768] [--key token] [--talk talk.json] [--seats seats.json]
  node referee.mjs selftest
`;

const command = process.argv[2] ?? "help";
const { rest, flags } = argsOf(process.argv.slice(3));
const matchId = typeof flags.id === "string" ? flags.id : defaultMatchId;
const asPlayer = typeof flags.as === "string" && /^P[1-9]$/.test(flags.as) ? flags.as : null;

const emit = (body) => {
  process.stdout.write(`${JSON.stringify(body)}\n`);
};

try {
  if (command === "help" || command === "-h" || command === "--help") {
    process.stdout.write(helpText);
    process.exit(0);
  }
  if (command === "selftest") {
    runSelftest();
    process.exit(0);
  }
  if (command === "new") {
    const playerCount = flags.players === undefined ? 3 : Number(flags.players);
    const rounds = flags.rounds === undefined ? 1 : Number(flags.rounds);
    const themes = typeof flags.themes === "string"
      ? flags.themes.split(",").map((theme) => theme.trim()).filter(Boolean)
      : defaultThemes;
    const discussion = flags.discussion
      ? {
        enabled: true,
        room: typeof flags.room === "string" ? flags.room : null,
        cycles: flags.cycles === undefined ? 2 : Number(flags.cycles),
      }
      : { enabled: false };
    const match = writeMatch(createMatch({ id: matchId, playerCount, rounds, themes, discussion }));
    emit({ ok: true, data: spectatorViewOf({ match, full: false }) });
    process.exit(0);
  }
  if (command === "open") {
    const match = readMatch(matchId);
    currentRoundOf(match).open = true;
    emit({ ok: true, data: spectatorViewOf({ match: writeMatch(match), full: false }) });
    process.exit(0);
  }
  if (command === "state") {
    emit({ ok: true, data: spectatorViewOf({ match: readMatch(matchId), full: true }) });
    process.exit(0);
  }
  if (command === "report") {
    emit({ ok: true, data: reportOf(readMatch(matchId)) });
    process.exit(0);
  }
  if (command === "wait") {
    if (!asPlayer) {
      fail("usage: referee wait --as P1 [--timeout 120]");
    }
    const timeout = flags.timeout === undefined ? 120 : Number(flags.timeout);
    waitFor({ id: matchId, player: asPlayer, timeoutSec: timeout }).then((payload) => {
      emit(payload);
      process.exit(payload.ok ? 0 : 1);
    });
  } else if (command === "clue" || command === "guess" || command === "play" || command === "pass" || command === "said") {
    if (!asPlayer) {
      fail(`usage: referee ${command} ... --as P1`);
    }
    const match = readMatch(matchId);
    if (!playersOf(match).includes(asPlayer)) {
      throw new Error(`unknown player: ${asPlayer}`);
    }
    const next = command === "clue"
      ? submitClue({ match, player: asPlayer, text: rest.join(" ") })
      : command === "guess"
        ? submitGuess({ match, player: asPlayer, pairs: rest })
        : command === "said"
          ? submitSaid({ match, player: asPlayer })
          : submitTurn({ match, player: asPlayer, action: command });
    writeMatch(next);
    emit({ ok: true, data: playerViewOf({ match: readMatch(matchId), player: asPlayer }) });
    process.exit(0);
  } else if (command === "serve") {
    const port = flags.port === undefined ? 8768 : Number(flags.port);
    readMatch(matchId);
    startServer({
      matchId,
      port,
      key: typeof flags.key === "string" ? flags.key : null,
      talkPath: typeof flags.talk === "string" ? path.resolve(flags.talk) : null,
      seatsPath: typeof flags.seats === "string" ? path.resolve(flags.seats) : null,
    });
  } else {
    fail(`unknown command: ${command}`);
  }
} catch (error) {
  emit({ ok: false, error: error.message });
  process.exit(1);
}
