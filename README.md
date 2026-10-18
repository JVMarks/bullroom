# Bullroom

**Your trading bots as an animated pixel-art office.** Each bot is a trader: seated while it holds a position, walking
around (coffee, chat) while flat, with its PnL floating over its head, and ejected from the room when it hits its
daily loss limit.

Bullroom is the visual window of **[OpenSpread](https://github.com/JVMarks/OpenSpread)**, an open-source, local-first
hub for crypto and stablecoin arbitrage trading. *A bitcoin100treta project.*

**Website and live demo:** https://jvmarks.github.io/OpenSpread/ (the demo runs simulated bots in your browser).

> **Two modes.** `?mock=trading`: simulated bots from a seeded simulator in your browser. `?source=core`: live,
> read-only public prices from the [OpenSpread core](https://github.com/JVMarks/OpenSpread) running on your computer.
> No API key, no orders, no real money. **Not financial advice.**

## Run it

Requires Node 22.12+.

```bash
npm install
npm run dev:client
```

Then open `http://localhost:5173/?mock=trading`. Options: `&bots=54` (up to 54), `&speed=10`, `&seed=7`.

Live data: run the OpenSpread core (`npm start` in `OpenSpread/core`) and open `http://localhost:5173/?source=core`.
Static demo for the website: `npm run build:demo` (builds `dist/demo` for the `/OpenSpread/demo/` path).

## Principles

- **Local-first.** No server of ours, no tracking. The upstream "Habblaud World" uplink is **off by default**
  (`HABBLAUD_WORLD=1` turns it on; never send simulated data to it, its terms forbid it).
- **Calm by default.** The room only moves when something happens.
- **Honest numbers.** Simulated is always labeled as simulated; losers are shown too.

## Credits

Bullroom is a fork of **[habblaud](https://github.com/marmottajr/habblaud)** by Márcio Junior (MIT), a pixel-art office
for Claude Code and Codex agents. The original license is kept in [`LICENSE`](LICENSE) and the original README in
[`docs/upstream-README.md`](docs/upstream-README.md). Thank you!

## License

MIT, see [`LICENSE`](LICENSE).
