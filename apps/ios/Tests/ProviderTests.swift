import Foundation

func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
    if !condition() { print("FAIL: " + message); exit(1) }
}

@main
struct ProviderTests {
    static func fixture(_ name: String) throws -> Data {
        try Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1]).appendingPathComponent(name))
    }

    static func main() throws {
        let gg = try GGCache.parse(String(decoding: try fixture("gg.js"), as: UTF8.self))
        expect(!gg.hosts.isEmpty && !gg.basePath.isEmpty && !gg.basePath.hasSuffix("/"), "gg.js gives hosts and a base path")
        let url = try gg.url(hash: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcfed")
        expect(url.host?.hasSuffix(".gold-usergeneratedcontent.net") == true && url.path.hasSuffix("/\(Int("dfe", radix: 16)!)/0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcfed.webp"),
               "Image URLs use the hash's last three characters (\(url))")
        print("PASS: gg.js and image URLs")

        let gallery = try Hitomi.parseGallery(String(decoding: try fixture("hitomi-gallery.js"), as: UTF8.self), id: 2110975)
        expect(!gallery.title.isEmpty && !gallery.pages.isEmpty && gallery.pages[0].width > 0, "Hitomi gallery has a title and sized pages")
        expect(gallery.pages[0].thumbnail.hasPrefix("https://tn.gold-usergeneratedcontent.net/webpsmalltn/"), "Hitomi thumbnails")
        let equals = try Hitomi.parseGallery("var galleryinfo = {\"title\":\"=LOVE\",\"files\":[]}", id: 1)
        expect(equals.title == "=LOVE", "A title with = still parses")
        let ids = try Hitomi.decodeNozomi(try fixture("bikini.nozomi"))
        expect(ids.count == 100 && ids.allSatisfy { $0 > 0 }, "Nozomi decodes big-endian IDs")
        expect(Hitomi.nozomiURL("female:big_breasts")?.absoluteString == "https://ltn.gold-usergeneratedcontent.net/n/tag/female:big%20breasts-all.nozomi", "Nozomi URL for a tag")
        expect(Hitomi.nozomiURL("language:japanese")?.absoluteString == "https://ltn.gold-usergeneratedcontent.net/n/index-japanese.nozomi", "Nozomi URL for a language")
        expect(Hitomi.parse("language:japanese -male:yaoi female:bikini") == (["language:japanese", "female:bikini"], ["male:yaoi"]), "Query terms")
        let suggestions = try Hitomi.parseSuggestions(try fixture("suggest.json"))
        expect(!suggestions.isEmpty, "Suggestions parse")
        print("PASS: Hitomi galleries, Nozomi, suggestions")

        let search = Imhentai.parseSearch(String(decoding: try fixture("search-language.html"), as: UTF8.self), page: 1)
        expect(search.ids.count >= 10 && search.total > 20 && !search.complete, "Imhentai search page: \(search.ids.count) ids, total \(search.total)")
        let keyed = Imhentai.parseSearch(String(decoding: try fixture("search-key.html"), as: UTF8.self), page: 2)
        expect(!keyed.ids.isEmpty, "Imhentai keyword search page")
        let imGallery = Imhentai.parseGallery(String(decoding: try fixture("imhentai-gallery.html"), as: UTF8.self), id: 1754698)
        expect(!imGallery.title.isEmpty && !imGallery.pages.isEmpty, "Imhentai gallery: \(imGallery.pages.count) pages")
        expect(imGallery.pages[0].image.hasPrefix("https://m") && imGallery.pages[0].image.hasSuffix("/1.jpg") || imGallery.pages[0].image.contains("/1."), "Imhentai image URLs")
        expect(imGallery.pages.allSatisfy { $0.thumbnail.contains("t.") }, "Imhentai thumbnails for every page")
        expect(!imGallery.language.isEmpty, "Imhentai language")
        expect(Imhentai.searchURL("language:japanese", page: 2).absoluteString == "https://imhentai.xxx/language/japanese/?page=2", "Language path")
        expect(Imhentai.searchURL("artist:some name", page: nil).absoluteString == "https://imhentai.xxx/artist/some-name/", "Namespace path")
        let keyword = Imhentai.searchURL("bikini,language:english", page: 3).absoluteString
        expect(keyword.contains("key=bikini") && keyword.contains("en=1") && keyword.contains("jp=0") && keyword.contains("page=3"), "Keyword search URL")
        print("PASS: Imhentai search and galleries")
    }
}
