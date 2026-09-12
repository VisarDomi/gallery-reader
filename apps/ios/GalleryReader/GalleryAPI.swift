import Foundation
import Security

// Only this LAN host may use the bundled PUBLIC local CA. TLS hostname and
// certificate validity are still evaluated; no accept-all certificate handler.
final class LocalTrust: NSObject, URLSessionDelegate, @unchecked Sendable {
    let host: String
    let certificateURL: URL?
    init(host: String, certificateURL: URL?) {
        self.host = host
        self.certificateURL = certificateURL
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              challenge.protectionSpace.host == host,
              let trust = challenge.protectionSpace.serverTrust,
              let certificateURL, let data = try? Data(contentsOf: certificateURL),
              let certificate = SecCertificateCreateWithData(nil, data as CFData)
        else { completionHandler(.performDefaultHandling, nil); return }
        SecTrustSetPolicies(trust, SecPolicyCreateSSL(true, host as CFString))
        SecTrustSetAnchorCertificates(trust, [certificate] as CFArray)
        SecTrustSetAnchorCertificatesOnly(trust, true)
        if SecTrustEvaluateWithError(trust, nil) {
            completionHandler(.useCredential, URLCredential(trust: trust))
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
        }
    }
}

// Requests already transferring finish; the next free slot goes to interactive
// work. Background requests remain queued and continue afterward.
actor TransferGate {
    private let limit: Int
    private var active = 0
    private var peak = 0
    private var waiting: [(path: String, urgent: Bool, continuation: CheckedContinuation<Void, Never>)] = []
    init(limit: Int) { self.limit = max(1, limit) }
    func acquire(_ path: String, urgent: Bool) async throws {
        if active < limit { active += 1; peak = max(peak, active) }
        else { await withCheckedContinuation { waiting.append((path, urgent, $0)) } }
        do { try Task.checkCancellation() }
        catch { release(); throw error }
    }
    func prioritize(_ path: String) {
        for index in waiting.indices where waiting[index].path == path { waiting[index].urgent = true }
    }
    func release() {
        if waiting.isEmpty { active -= 1 }
        else {
            let index = waiting.firstIndex(where: \.urgent) ?? 0
            waiting.remove(at: index).continuation.resume()
        }
    }
    func statistics() -> (peak: Int, waiting: Int) { (peak, waiting.count) }
}

struct HTTPResult: Codable, Sendable {
    let status: Int
    let headers: [String: String]
    let body: String
}

actor GalleryAPI {
    private let session: URLSession
    private let gate = TransferGate(limit: 12)
    private let origin: String
    init(origin: String, pc: URL, certificateURL: URL?) {
        self.origin = origin
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 25
        config.timeoutIntervalForResource = 90
        config.httpMaximumConnectionsPerHost = 12
        config.urlCache = URLCache(memoryCapacity: 8 * 1024 * 1024, diskCapacity: 64 * 1024 * 1024)
        let queue = OperationQueue(); queue.name = "GalleryReader.Network"; queue.maxConcurrentOperationCount = 1
        session = URLSession(configuration: config, delegate: LocalTrust(host: pc.host ?? "", certificateURL: certificateURL), delegateQueue: queue)
    }
    func request(_ input: Data, image: Bool = false) async throws -> (Data, HTTPURLResponse) {
        let args = try JSONSerialization.jsonObject(with: input) as? [String: Any] ?? [:]
        guard let raw = args["url"] as? String, let url = URL(string: raw), url.scheme == "https", url.host != nil else { throw ReaderError.invalidRequest }
        var request = URLRequest(url: url)
        request.httpMethod = args["method"] as? String ?? "GET"
        for (key,value) in args["headers"] as? [String:String] ?? [:] { request.setValue(value, forHTTPHeaderField: key) }
        let referrer = args["referrer"] as? String ?? origin + "/"
        request.setValue(referrer.hasPrefix("https://") ? referrer : origin + "/", forHTTPHeaderField: "Referer")
        if let body = args["body"] as? String { request.httpBody = Data(body.utf8) }
        await gate.prioritize(url.absoluteString)
        try await gate.acquire(url.absoluteString, urgent: image)
        do {
            let (data,response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw ReaderError.invalidRequest }
            try Task.checkCancellation()
            await gate.release()
            return (data,http)
        } catch { await gate.release(); throw error }
    }
}
