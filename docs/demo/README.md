# Product demo video

A 65-second, 1080p product demo rendered deterministically from the real app:
no screen-recording jitter, every frame seeked and captured, music synthesized
in code so there is nothing to license.

The rendered film is committed next to this file as `404less-demo.mp4` (the
README links to it through `poster.jpg`); re-render and replace both after a
UI change.

```
docs/demo/
  composition.html   the film: scenes, captions, camera moves, cursor, typing (WAAPI timeline)
  capture.mjs        screenshots the real UI states the film uses (2x) into assets/
  seed.sh            seeds a local instance with the "Acme Docs" demo data
  music.mjs          renders music.wav (96 BPM, pads + arp + soft kick, side-chained)
  render.mjs         seeks the composition frame by frame → ffmpeg → 404less-demo.mp4
```

## Re-render after a UI change

```bash
npm run build:web && npm run dev        # local instance on :8787
bash docs/demo/seed.sh                  # demo site + hits + crawl findings; writes .demo.env
set -a; . docs/demo/.demo.env; set +a
NODE_PATH=$(npm root -g) node docs/demo/capture.mjs   # needs playwright + chromium
node docs/demo/music.mjs
NODE_PATH=$(npm root -g) node docs/demo/render.mjs    # ~5 min; needs ffmpeg
```

Fonts: the composition uses Inter, Inter Display and JetBrains Mono as system
fonts. Preview single frames with `FRAMES=48,300,900 node docs/demo/render.mjs`
(writes `stills/`), or a time range with `RANGE=27,38`.

Generated files (`assets/`, `music.wav`, `stills/`, `*.mp4`, `.demo.env`) are
git-ignored; the sources above are all that is needed to rebuild them.
