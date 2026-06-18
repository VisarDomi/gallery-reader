- Anchoring an edit on lines inside a folded/elided summary (`..`/`…`) → error "This edit anchors to lines X-Y ... never displayed ... Re-read them in full first with a ranged read like `file:28-33`". Fix: use `read path:28-33` to force full-line display and mint a fresh tag, then edit against that tag.

- `SWAP 26:=26:` — error "payload line has no preceding hunk header". The `:=` separator between line numbers is wrong; correct format is `SWAP N.=M:` with `.=` between numbers, not `:=`.
