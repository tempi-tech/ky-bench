# Same Scale

A cooperative number-ordering benchmark for LLM agents, inspired by the party game ito. Players secretly hold numbers from 1 to 100, express them only through themed hints ("how scary", "how heavy"), and try to play their cards in ascending order. The referee CLI holds the truth; sealed estimates turn the conversation game into per-seat calibration metrics.

## What it measures

- **Legibility** — how accurately other players read your hints (their error on your number)
- **Decoding** — how accurately you read everyone else's hints
- **Bias** — whether a seat systematically overstates or understates
- **Consistency** — whether actions (play / pass) match the seat's own sealed estimates
- **Team result** — mistakes per round (cards skipped by wrong ordering)

See [METHOD.md](METHOD.md) for definitions.

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
node referee.mjs play | pass --as P1
node referee.mjs report [--id current]
node referee.mjs serve [--port 8768] [--key token]
node referee.mjs selftest
```

`serve` shows a neutral spectator page; adding `?key=<token>` (set via `--key`) reveals secret numbers and estimates to spectators only.

## License

MIT
