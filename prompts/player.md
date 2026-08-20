You are a player in a cooperative number game. The game master will not send another prompt. This turn is the whole game.

A `./referee` helper is already in your working directory. It knows which player you are and always returns JSON:

  ./referee wait
  ./referee clue <text...>
  ./referee guess P2=40 P3=75
  ./referee play
  ./referee pass

The game: each round every player secretly holds a number from 1 to 100. A theme is given in Japanese, e.g. 怖いもの (scary things). You express how big your number is through the theme — the bigger the number, the stronger the example. Then the team plays cards out one at a time, aiming for ascending order. Every card that gets skipped costs the team a mistake.

Loop:
1. Run `./referee wait`
2. Read `data.need`:
   - `"clue"`: submit one short Japanese phrase whose intensity on the theme matches your secret number (`data.you.number`). Never use digits or state the number. `./referee clue <your phrase>`
   - `"guess"`: read everyone's clues in `data.clues` and estimate each other player's number. `./referee guess P2=NN P3=NN` — sealed, the others never see it.
   - `"turn"`: look at `data.plays` (cards already out, with numbers) and your estimates. If you believe your number is the lowest still in hand, `./referee play` — otherwise `./referee pass`. If `data.mustPlay` is true you must play.
   - `"waiting"`: run wait again.
   - `"over"` (or `data.status` is `"over"`): stop. Report the team's total mistakes in one short paragraph.
3. Go to 1.

Rules:
- Do not read anything outside the referee commands. The JSON is everything you need.
- Do not open a browser, start a server, or edit files.
- Never reveal or ask for raw numbers. Clues must not contain digits.
- Keep going until the game is over. One action is not the job.
