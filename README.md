<p align="center"><img src="docs/img/mascot-trader.webp" alt="Bullroom mascot: a golden bull robot trading at a monitor" width="160"></p>

# Bullroom

**Your trading bots as an animated pixel-art office.** Each bot is a trader: seated while it holds a position, walking
around (coffee, chat) while flat, with its PnL floating over its head, and ejected from the room when it hits its
daily loss limit.

Bullroom is the visual window of **[OpenSpread](https://github.com/JVMarks/OpenSpread)**, an open-source, local-first
hub for crypto and stablecoin arbitrage trading. *A bitcoin100treta project.*

**Website and live demo:** https://bullroom.vercel.app (the demo runs simulated bots in your browser).

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
Static demo for the website: `npm run build:demo` (builds `dist/demo` with relative paths; works under any path).

## Principles

- **Local-first.** No server of ours, no tracking. The upstream "Habblaud World" uplink is **off by default**
  (`HABBLAUD_WORLD=1` turns it on; never send simulated data to it, its terms forbid it).
- **Calm by default.** The room only moves when something happens.
- **Honest numbers.** Simulated is always labeled as simulated; losers are shown too.

## Support

Free and open source, funded only by donations (voluntary gifts: they buy no product, service or advice).

- **Lightning:** `sickfog79@walletofsatoshi.com`
- **Bitcoin on-chain:** `bc1qwk9qmeqm3fwc5q29yu945z0tuvn2yqwvf3wt9cayt5s886lcuhssejj98j`

## Follow

Updates, videos and lives on **bitcoin100treta**: [YouTube](https://www.youtube.com/channel/UCHQam-riGkJR4N5nGc8UZYQ) ·
[Instagram](https://www.instagram.com/bitcoin100treta) · [TikTok](https://www.tiktok.com/@bitcoin100treta2.0) ·
[X](https://x.com/bitcoin100treta) · [Twitch](https://www.twitch.tv/bitcoin100treta) · [all links](https://linktr.ee/bitcoin100treta)

## Credits

Bullroom is a fork of **[habblaud](https://github.com/marmottajr/habblaud)** by Márcio Junior (MIT), a pixel-art office
for Claude Code and Codex agents. The original license is kept in [`LICENSE`](LICENSE) and the original README in
[`docs/upstream-README.md`](docs/upstream-README.md). Thank you!

## License

MIT, see [`LICENSE`](LICENSE).
