imhentai.xxx --- AND works via comma: key=nakadashi%2Ccheating (URL-encoded comma):
https://imhentai.xxx/search/?lt=0&pp=0&m=1&d=1&w=1&i=1&a=1&g=1&key=nakadashi%2Ccheating&apply=Search&en=0&jp=1&es=0&fr=0&kr=0&de=0&ru=0&dl=0&tr=0
Language filter works: jp=1&en=0...
Category filters: m=1&d=1&w=1&i=1&a=1&g=1 (manga, doujinshi, western, image set, artist CG, game CG)
Other params: lt=0&pp=0 (probably sort order/limit), dl=0&tr=0 (download/translate flags?) 

hitomi.la supports AND or NOT and not cloudflare blocked

hentaipaw.com biggest library but doesn't support AND or NOT

imhentai.xxx supports AND but not NOT. second biggest library.

asmhentai doesn't support AND or NOT

nhentai both AND and NOT work. but has cloudflare. and smaller library than hitomi.

exhentai japanese purged... went from biggest to smallest library



 | Provider       | Japanese    | AND                                     | NOT                      | Pagination                   | CF  | API      | bfcache              |
 |----------------|-------------|-----------------------------------------|--------------------------|------------------------------|-----|----------|----------------------|
 | hitomi.la      | 541k        | lang:jp female:tag                      | -female:yaoi             | instant (Nozomi blob)        | no  | gg.js    | max-age=3600         |
 | imhentai.xxx** | 745k        | key=tag1,tag2                           | no                       | random page=N (40/pg)        | no  | none     | no-store             |
 | nhentai.net    | 259k        | tag:"x"                                 | -tag:"y"                 | random page=N (25/pg)        | yes | /api/v2/ | unknown (CF block)   |
 | hentaipaw.com  | 1.16M total | no                                      | no                       | random page=N (30/pg)        | no  | none     | no-store             |
 | asmhentai.com* | 347k        | no                                      | no                       | random page=N (~25/pg)       | no  | none     | no-store             |
 | imhentai.to    | 335k        | no                                      | no                       | random page=N (~25/pg)       | no  | none     | no-cache, private    |
 | hentaihand.com | 310k        | languages=3&tags=168 (lang+tag only)    | no                       | random page=N (18/pg capped) | no  | /api/    | no-cache, private    |
 | 3hentai.net    | ~173k       | no                                      | no                       | random page=N (25/pg)        | no  | none     | no-cache, private    |
 | naisho.moe     | ~555k       | tags[0][name]=female:nakadashi          | tags[1][excluded]=1      | sequential cursor (24/pg)    | no  | Livewire | no-store             |
 | cin.guru       | ~308k       | tags=lang:jp,tag:nakadashi              | tagsRemove=tags:cheating | random page=N (25/pg)        | no  | none     | max-age=14400        |
 | exhentai.org   | 0.8k        | namespaced                               | namespaced               | API                          | no  | api.php  | unknown (no resp)    |
 | akuma.moe      | ?           | ?                                       | ?                        | sequential (cursor)          | no  | none     | no-store             |


* asmhentai.com/hentai.name/hentai2.net
** imhentai.xxx/hentaizap.com
