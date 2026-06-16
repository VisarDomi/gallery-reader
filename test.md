App is designed to work with safari ios and its caching behavior when you swipe back and forth. The philosophy is to use as many native features as we can.

3 modes:
1. reader - biggest reason for this app - show all images in a vertical strip. restore reader position on startup based on the url which has a hash that points to the image.
2. search - second biggest reason - a good way to navigate and explore the site.
3. favorites - a nice feature to have so that we don't depend on safari's bookmark ecosystem. Ideally should be removed in favor of safari's bookmarks, so that we can go even more native. Needs real testing to see how the native implementation would feel in comparison.

Favorites and search are basically the same thing, except for the way they load data. Favorites uses localstorage to load the gallery ids while search uses hitomi to get the gallery ids of that search.

Ios back swipe caching behavior is the single biggest feature of this app. Example flows:

1. When you go from search to reader, then you swipe back to search, safari will load the cache version of search, which makes the swipe back feels instant. Here we fill in the search input with the correct search from the url at pagereveal event. What a nice feel.
2. Because of how we implement search pagination with hash and by replacing safari history, a swipe back doesn't go to previous page but to previous search. So the flow becomes: search term1, go to page n, search term2 go to page m, swipe back - it goes to search term1 page n again. What a good flow.
3. Another flow is opening the infomodal and clicking on a search term, say artist, we trigger a search on that artist along with the language of that gallery. Then go to page 2. on swipe back, we go back to the infomodal, so that we can either close the infomodal or choose another search term. Very nice.

How search looks like:

1. a fullwidth multiline (only for show) search input that has dropdown suggestions on typing and fills with that suggestion when clicked on it. positive and negative search terms. has OR functionality. all negative or empty query searches language:japanese as the positive query. search button is hidden, it's only there to make search input trigger the search correctly. enter or clicking on a savedsearch executes the search. on search query execution, the search is saved to localstorage as a savedsearch.
2. the saved searches are displayed right below the search input. one savedsearch per line, with an x at the right to remove it. show 3 searches by default, expand by clicking show N more. ordered by most recent.
3. the most important part: the content. it's the search results displayed in rows, one gallery per row. the row is full width with 300px height. the row can be scrolled horizontally and has the thumbnails inside it, 100px wide. the thumbnails are cover (cropped to center) and on click they open the reader at the appropriate place. the skeleton is first created with the correct galleryid order then content is filled in asyncly.
4. there's a favorite toggle and info modal icon to show the infomodal for each galleryrow - bottom right position.
5. infomodal - loads metadata asyncly. has clickable search terms with use the language of the gallery as the language term. things it shows are provider specific. close on close button or backdrop.
5. pagination is right at the end. all the pages are shown simultaneously. on page change which is caught by a hashchange event, we change hash of url and also the saved search. this makes it possible that safari swipe backs send you back to the previous search instead of previous page. also the saved search is now keeping up with the latest state of the app

Provider details for hitomi:
1. search results are executed with an api, not scrapped from dom. after getting the full list of gallerids, we show the results of the correct page based on pagination and results per page which is 25.
2. thumbnails and reader images are resolved by an api call to the galleryid endpoint.
3. we load the sites javascript to handle suggestions dropdown population.
4. infomodal specific info we show for hitomi: artist,group,series,type,character,language,tag
