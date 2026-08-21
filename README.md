# KY-Bench

**Can LLMs read the room?** — 空気読めるかベンチマーク。

KY-Bench measures social air-reading in LLM agents through cooperative games: how accurately an agent reads what others mean (decoding), how legibly it signals what it means (legibility), and whether it stands its ground when the group consensus is wrong. Every game is played fully blind — players know each other only as P1…Pn — and sealed estimates turn the conversation into per-seat quantitative metrics, scored mechanically with no LLM judging.

## Game #1: Same Scale

A cooperative number-ordering game, inspired by the party game ito. Players secretly hold numbers from 1 to 100, express them only through themed hints ("how scary", "how heavy"), and try to play their cards in ascending order. The referee CLI holds the truth.

## What it measures

- **Legibility** — how accurately other players read your hints (their error on your number)
- **Decoding** — how accurately you read everyone else's hints
- **Bias** — whether a seat systematically overstates or understates
- **Consistency** — whether actions (play / pass) match the seat's own sealed estimates
- **Team result** — mistakes per round (cards skipped by wrong ordering)

See [METHOD.md](METHOD.md) for definitions.

## Standings

[standings.json](standings.json) holds the aggregated rankings and a per-game index, regenerated mechanically from `matches/` after every game:

```bash
node standings.mjs
```

## Quick start

```bash
node referee.mjs new --players 3 --themes "怖いもの"
node referee.mjs serve --port 8768        # spectator page: http://127.0.0.1:8768
```

One round = one game is the default: fresh agents and a fresh theme per game keep every data point independent (see [METHOD.md](METHOD.md)).

Launch one agent per player and hand each `prompts/player.md` plus its player id. Each player then loops on its own:

```bash
./referee wait                  # what do I need to do?
./referee clue 夜中にきしむ床の音   # express your number through the theme
./referee guess P2=40 P3=75     # sealed estimates of the others
./referee play                  # or: ./referee pass
```

## CLI

```
node referee.mjs new [--players 3] [--rounds 1] [--themes a,b,c] [--id current]
                     [--discussion [--room talk_xxx] [--cycles 2]]
node referee.mjs state [--id current]
node referee.mjs wait --as P1 [--timeout 120]
node referee.mjs clue <text...> --as P1
node referee.mjs guess P2=40 P3=75 --as P1
node referee.mjs said --as P1
node referee.mjs open [--id current]
node referee.mjs play | pass --as P1
node referee.mjs report [--id current]
node referee.mjs serve [--port 8768] [--key token] [--talk talk.json] [--seats seats.json]
node referee.mjs selftest
```

`serve` shows a neutral spectator page; adding `?key=<token>` (set via `--key`) reveals secret numbers, estimates, and — when `--seats` points at a seat-assignment file — each player's identity (`{"seats":{"P1":{"agentType":"...","model":"...","effort":"..."}}}`, or a `display` string per seat) to spectators only. Players never see any of it.

`--talk` embeds a live discussion feed at the bottom of the spectator page. Point it at a JSON file shaped `{"messages":[{"seq":1,"name":"P1","text":"...","at":"ISO"}]}` and keep the file updated with whatever chat system hosts the discussion — the runner mirrors the transcript in, the referee stays chat-agnostic.

## License

MIT
