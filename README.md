# Gallery-reader
Hitomi and Imhen, native iPhone apps that rework the UI of the providers supported by this repo

## What?
The apps change the UI of the supported providers so that it's easier to navigate the site. 3 main features: favorites, search, reader.

## Why?
The sites' own navigation is cumbersome. The apps keep every screen alive while you go back
and forth, keep searches, galleries and images on the phone, and survive being killed at any
moment.

## How?
[features.md](features.md) explain the flows that this app handles best.

## Combo
If you're on ios, you can use it's ocr and shirabe to translate kanjis you don't know:

ios26 compatible:
```
https://www.icloud.com/shortcuts/a6f8837947004d72a19a979cb559dd64
```

Use that in the shortcuts app of ios and make the shortcut activate by going to: Settings - Accessibility - Touch - Back Tap - Double Tap - you select the japanese ocr shortcut here.

## setup
[apps/ios/README.md](apps/ios/README.md): build, deploy, test.

## Docs
- [AGENTS.md](AGENTS.md): for coding agents: ownership and where to start (including the
  shared NativeKit, Mac access and renewal guides outside this repository).
- [features.md](features.md): the flows, as the owner uses them.
- [apps/ios/README.md](apps/ios/README.md): the apps' rules, code, data, providers, caching,
  build, deploy, tests and gotchas.
- [server/README.md](server/README.md): the PC backup server.
- Older docs (the port notes, the site survey, the web version's test plan) are in Git
  history at `6e3b2b2`; the web version's code at `1eb1676`.
