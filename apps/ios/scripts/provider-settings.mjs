// One provider's build settings, the text of build/<provider>/provider.xcconfig: its name and
// bundle ID, and the PC's two servers. At home the apps reach them on the LAN (the backup
// address here; Gallery Downloader's is fixed in Resources/Info.plist). Away from home they use
// the public addresses, where the favorites server asks for its own key. Both keys end up in
// the ignored build folder and in the built app, never in Git.

// What a key may be made of: it travels in an xcconfig value, an Info.plist string and an
// HTTP header.
const keyCharacters = /^[A-Za-z0-9._~+/=-]+$/;
// xcconfig treats "//" as a comment: "/$()/" keeps URLs (and keys) whole.
const escape = value => value.replaceAll('//', '/$()/');

// A public address: https only (the keys travel to it), nothing but host and path.
function publicAddress(name, value) {
    let url;
    try { url = new URL(value); } catch { throw new Error(`${name} is not a URL`); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || /[\s$"'\\]/.test(value)) {
        throw new Error(`${name} must be a plain https address`);
    }
    return escape(value.replace(/\/+$/, ''));
}

function key(name, value) {
    // Never echo the value.
    if (typeof value !== 'string' || !keyCharacters.test(value)) throw new Error(`${name} is empty or has characters a build setting cannot carry`);
    return escape(value);
}

export function providerSettings(provider, config, pc) {
    return [
        `READER_DISPLAY_NAME = ${config.name}`, `READER_PROVIDER = ${provider}`, `PRODUCT_BUNDLE_IDENTIFIER = ${config.bundleId}`,
        `PRODUCT_NAME = ${config.name}`,
        `READER_BACKUP_URL = ${escape(pc.backupURL)}`, `READER_BACKUP_KEY = ${key('The backup key', pc.backupKey)}`,
        `READER_BACKUP_PUBLIC_URL = ${publicAddress('The public backup address', pc.backupPublicURL)}`,
        `READER_FAVORITES_PUBLIC_URL = ${publicAddress('The public favorites address', pc.favoritesPublicURL)}`,
        `READER_FAVORITES_KEY = ${key('The public favorites key', pc.favoritesKey)}`, ''].join('\n');
}
