# Testing the dropdown selection

## Build
```
npm run build
```

## Browser test steps
1. Inject `dist/hitomi.user.js` into browser (or open https://hitomi.la/ with Tampermonkey)
2. Navigate to home page (`https://hitomi.la/`)
3. Type a partial term in the search box (e.g., `yu`)
4. Wait for autocomplete dropdown to populate (~2-5s after typing stops)
5. Click a suggestion (e.g., "yuri (female)")
6. Verify:
   - Input updates to include `female:yuri ` replacing the partial term
   - Dropdown clears
   - Input retains focus

## Debug panel
Sticky panel at top of page shows event trace in real time:
- **Green** (`pointerdown/mousedown/click CAPTURE`): raw event flow
- **Purple** (`PREVENTED`): href navigation intercepted
- **Orange** (`clear_page`): dropdown HTML cleared
- **Green** (`selection:`): our handler updated the input
- **Red** (`click CAPTURE document`): document-level click (triggers `.active` removal)
- **Blue/Orange** (`.active ADDED/REMOVED`): class toggles on search wrapper

**"Copy log" button** at top-right of debug panel copies the raw text to clipboard (works on Safari iOS 13.4+ with legacy fallback).

## What the test validates
- Dropdown suggestions populate from hitomi's tag index
- Clicking a suggestion inserts `namespace:term` into the search input
- Partial term is replaced correctly (not appended)
- Dropdown dismisses after selection
