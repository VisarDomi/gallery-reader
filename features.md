The apps are built around a stack of live screens: swiping back from the left edge returns to
the previous screen exactly as it was (the same rows, positions, sideways strip offsets and open
details), and swiping in from the right edge goes forward again. The stack and every screen's
position are saved on the phone, so a relaunch after iOS ended the app (or a kill, or a power
off) opens the same screen at the same point, with the same Back history.

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
   they slide away while you scroll down and come back with any scroll up, so search is always
   at hand without returning to the top. Favs toggles: from a search it goes back to the
   favorites (the search stays for a forward swipe or a tap on a saved search); on the
   favorites it is lit, and tapping it goes forward to the search again.
2. A multiline search box. Hitomi suggests tags for the word being typed; a suggestion replaces
   that word. Positive and negative terms; an empty query (Hitomi: or only negative terms)
   searches language:japanese. Return or tapping a saved search runs the search and saves it.
3. Saved searches right below the search box, one per line (a long one keeps its start and end,
   with "…" in the middle), with an x to remove it. 3 shown by default, "Show N more" expands.
   Most recent first.
4. The most important part: the content. One gallery per row, full width and 300 points tall,
   scrolled sideways through its page thumbnails (100 points wide, cropped to fill). A thumbnail
   opens the reader at that page. Rows appear in the right order at once and fill in as their
   details arrive; on-screen thumbnails load first.
5. A heart (favorite) and an "i" (details) at each row's bottom right.
6. Details: titles, artists, groups, series, type, characters, language, pages, date and tags.
   Every value is a search in the gallery's language. Close or tap outside.
7. One continuous list instead of pages. A search shows the phone's copy of its results at once,
   searches again in the background, and merges the new results without moving the rows on
   screen. Imhen loads its further pages as the end comes near.

Favorites and search are the same list, except for where the galleries come from: favorites
are the phone's list, search asks the site. Favorites can be imported (gallery IDs), merged and
exported at the end of the list.

How reader looks like:
1. All pages in a vertical strip, full width on black, zoomed and panned like a web page.
2. Opened from a thumbnail, that page's top sits at the screen's middle. Reopened (or relaunched)
   it returns to the exact point: the page at the screen's middle and how far down that page.
3. Every page has its final height before its image arrives (the sizes are known), so nothing
   jumps while images load; the pages nearest the screen load first, and a list under the
   reader stops asking for its thumbnails meanwhile.
4. Kill and offline robust: the exact point is saved as you read; pages already on the phone
   show without the network; a page that cannot load says why (waiting for the network, or
   the error) and is asked again by itself; a gallery not on the phone yet waits for the
   network and opens when it returns.
