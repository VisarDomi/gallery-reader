The apps are built around a stack of live screens: swiping back from the left edge returns to
the previous screen exactly as it was (the same rows, positions, sideways strip offsets and open
details), and swiping in from the right edge goes forward again. The stack and every screen's
position are saved on the phone, so a relaunch after iOS ended the app (or a kill, or a power
off) opens the same screen at the same point, with the same Back history. Its first frame is
already that screen as it was left: the kept results, gallery details, thumbnails and pages on
the phone are read before it (nothing fills in afterwards), and the screens below are built
while it shows, so going back finds them complete. The newest results then join without moving
the rows on screen.

3 modes:
1. reader - biggest reason for this app
2. search - second biggest reason - a good way to navigate and explore the site.
3. favorites - a nice feature that looks good

Example flows:

1. Search, open a reader, swipe back: the search is still there, untouched, at the same row, so
   the swipe back is instant. The search box shows that screen's query.
2. Search term1, scroll far down, search term2, scroll, swipe back: term1 again, at the row you
   left. Every search remembers its place, so scrolling down a long list works as a soft
   bookmark.
3. Open a gallery's details, tap a search term (say the artist): the search opens with the
   gallery's language. Swipe back and the details are still open, so you can close them or pick
   another term.

How search looks like:

1. The search box, the saved searches, the result count and **Favs** float on top of the list:
   they move with the list, point for point: scrolling down slides them away, scrolling up
   brings them back at the same pace, and they stay wherever the scroll leaves them (no
   snapping). At the top of the list they are fully shown. Search is always at hand without
   returning to the top. Favs toggles: from a search it goes back to the
   favorites (the search stays for a forward swipe or a tap on a saved search); on the
   favorites it is lit, and tapping it goes forward to the search again.
2. The search box: one line like a saved search (a long query keeps its start and end, with "…"
   in the middle) until tapped, then the whole query on as many lines as it needs. Hitomi
   suggests tags for the word being typed; a suggestion replaces
   that word. Hitomi: terms separated by spaces, a leading "-" excludes one. Imhen: terms
   separated by commas, all required (the site cannot exclude). An empty query (Hitomi: or
   only excluded terms) searches language:japanese. Return or tapping a saved search runs the
   search and saves it.
3. Saved searches right below the search box, one per line (a long one keeps its start and end,
   with "…" in the middle), with an x to remove it. 3 shown by default, "Show N more" expands.
   Most recent first.
4. The most important part: the content. One gallery per row, full width and 300 points tall,
   scrolled sideways through its page thumbnails (100 points wide, cropped to fill). A thumbnail
   opens the reader at that page. Rows appear in the right order at once and fill in as their
   details arrive; on-screen thumbnails load first. Ahead of the screen, in the background and at
   low priority, the app fetches the details of the galleries around the row at the screen's
   middle (outwards, below first), each with its strip's first screen of thumbnails, then the
   whole strips of the nearest rows, so a fast scroll down the list or along a strip finds them
   on the phone (Prefetch.swift; it follows the list as it moves and pauses under a reader).
   A strip being swiped comes first: its nearest thumbnails, the way it moves, at high priority,
   then the rest of it. A thumbnail already downloading is shared without restarting it;
   one queued for later moves ahead of speculation when it appears on screen.
5. A heart (favorite) and an "i" (details) at each row's bottom right.
6. Details: titles, artists, groups, series, type, characters, language, pages, date and tags.
   Every value except pages and date is a search in the gallery's language. Close or tap
   outside.
7. One continuous list instead of pages. A search shows the phone's copy of its results at once,
   searches again in the background, and merges the new results without moving the rows on
   screen (and not while the list is moving: that would stop a fling). Imhen loads its further
   pages when the screen is within 100 rows of the end, so a fast scroll never reaches it.

Favorites and search are the same list, except for where the galleries come from: favorites
are the phone's list, search asks the site. Favorites can be imported (gallery IDs), merged and
exported at the end of the list.

How reader looks like:
1. All pages in a vertical strip, full width on black, zoomed and panned like a web page.
2. Opened from a thumbnail, that page's top sits at the screen's middle. Reopened from the
   thumbnail of the page it was left on (or relaunched), it returns to the exact point: the
   page at the screen's middle and how far down that page.
3. Every page has its final height before its image arrives (the sizes are known), so nothing
   jumps while images load; the pages nearest the screen load first, and a list under the
   reader stops asking for its thumbnails meanwhile.
4. The reader comes first: the pages on screen, then the nearest ones the way you read (high
   priority), then the rest of the gallery, all onto the phone; only then does the list's work
   ahead go on (its thumbnails, low priority).
5. Kill and offline robust: the exact point is saved as you read; pages already on the phone
   show without the network; a page that cannot load says why (waiting for the network, or
   the error) and is asked again by itself; a gallery not on the phone yet waits for the
   network and opens when it returns.
