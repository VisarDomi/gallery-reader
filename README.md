# Gallery-reader
A userscript used for tampermonkey on pc and userscript on ios.

## What?
This script changes the UI of the providers supported by this script so that's it easies to navigate the site. 3 main features: favorites, search, reader.

## Why?
Native navigation is cumbersome.

## How?
[features.md](features.md) explain the flows that this app handles best.

## Combo
If you're on ios, you can use it's ocr and shirabe to translate kanjis you don't know:

```
https://www.icloud.com/shortcuts/44abd8aa02de42a5a5986c10385e0c33
```

Use that in the shortcuts app of ios and make the shortcut activate by going to: Settings - Accessibility - Touch - Back Tap - Double Tap - you select the japanese ocr shortcut here.

## Gallery Downloader sync

On Hitomi, the userscript sends the complete local favorites list to Gallery Downloader on startup and after every favorite/import change. Sync is best-effort: an unavailable PC never blocks or rolls back the local favorite action, and the next full snapshot repairs missed changes.

The default server is `https://192.168.1.197:7777`. Override it while building with `VITE_GALLERY_SERVER_URL`:

```bash
VITE_GALLERY_SERVER_URL=https://your-lan-host:7777 npm run build
```

imhentai favorites remain local until Gallery Downloader gains an imhentai download provider.

## [Testing](test.md)
Install debug.user.js and change iphone display auto-lock to never (remember to change it back) then run npm run tests
