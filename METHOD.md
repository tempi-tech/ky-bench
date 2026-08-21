# Methodology

How Same Scale, KY-Bench's cooperative hint game, becomes per-seat quantitative metrics.

## Protocol per round

1. The referee deals each player a secret number (1–100, distinct) and announces a theme
2. **Clue** — every player submits one phrase expressing its number's magnitude on the theme. Digits are rejected mechanically
3. **Sealed estimates ①** — every player submits numeric estimates of every other player's number, visible only to the referee
4. **Discussion** (discussion games only) — after estimates the round holds until the runner runs `open` (so a spectator-facing header can land before the first speaker). Then each player presents its own clue in the shared talk room, one by one (announce), and players speak in turn, one short message per turn about relative order, numbers forbidden. After the configured cycles, every player submits **sealed estimates ②**
5. **Order** — turn-based: on your turn, `play` (claim: my number is the lowest still in hand) or `pass`. A full cycle of passes forbids passing on the next cycle, which breaks stalemates mechanically. A wrong `play` auto-discards every skipped lower card; each skipped card counts one team mistake

The sealed-estimate step is what converts the game into measurements: every outcome reduces to numbers vs numbers, scored mechanically with no LLM judging.

## Game unit

**One round = one game** is the default measurement unit. Rounds are independent (fresh numbers, fresh theme), so playing them in separate games with fresh player agents and a fresh talk room keeps every data point i.i.d.:

- No cross-round calibration — in a multi-round game, players see the true numbers after each round and learn each seat's clue style, inflating decoding scores beyond a first-encounter read
- No context accumulation — a player's own earlier rounds and the growing talk-room log would otherwise sit in context and make late rounds heavier and noisier
- No reveal leakage — the post-game seat reveal never lands in a room a later round will read

Multi-round games (`--rounds N`) remain supported as an explicit **adaptation variant** — measuring how seats calibrate to each other across rounds — and are reported separately, never mixed into default scores. Aggregate scores are computed across games, not within one.

## Per-seat metrics

With true numbers `n` and estimates `e`:

- **Decoding error** — `mean |e(me → other) − n(other)|`: how well the seat reads hints
- **Legibility error** — `mean |e(other → me) − n(me)|`: how well the seat's hints are read
- **Bias** — the signed mean of the same differences: systematic overstatement (+) or understatement (−)
- **Skill normalization** — random guessing on uniform 1–100 gives an expected error of 33.3, so `skill = 1 − MAE / 33.3` (0 = random, 1 = perfect)
- **Consistency** — a wrong play while the seat's own estimates said a lower card was still in hand is an inconsistent play: the action contradicted the seat's stated beliefs
- **Discussion gain** (discussion games only) — the seat's estimate error before (①) minus after (②) the discussion: how much the talk actually improved its picture
- **Incidents** — digit-containing clues, timeouts, protocol violations

Team-level: mistakes per round, perfect-round rate.

## Variance control

- **Probe-seat design**: fix all but one seat as anchors and vary only the seat under test — partner effects cancel
- **Paired suites**: fixed (theme, numbers) sets replayed across lineups make comparisons paired rather than independent
- Themes split into physical scales (weight, size) and cultural scales (scary, delightful) and reported separately: unit calibration vs common-ground modeling

## Blinding

Same rules as our other benches: players know only their player id. Seats (`model · effort`) are held by the runner outside the players' reach and written into the record after the game ends. During play the spectator API is neutral; a keyed overlay (`serve --key`, plus `--seats` for identities) reveals numbers, estimates, and seat assignments to spectators only.

## Limits

Legibility is relative to the pool of readers — scores are comparable within a season with frozen anchors, not across seasons. This is inherent to audience-dependent games and is stated rather than hidden.
