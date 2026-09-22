import Foundation

enum ReaderError: LocalizedError {
    case invalidRequest, badResponse(Int)
    var errorDescription: String? {
        switch self { case .invalidRequest: return "Invalid reader request"; case .badResponse(let code): return "Image request failed (HTTP \(code))" }
    }
}

// Only idempotent public reads use this recovery policy. Cancellation terminates
// connectivity waits and backoff immediately; permanent HTTP failures are returned.
private struct RetryableResponse: Error { let after: Double? }
func retryableResponse(_ response: URLResponse) throws {
    guard let http = response as? HTTPURLResponse,
          [408, 429, 500, 502, 503, 504].contains(http.statusCode) else { return }
    let header = http.value(forHTTPHeaderField: "Retry-After")
    var after = header.flatMap(Double.init)
    if after == nil, let header {
        let format = DateFormatter(); format.locale = Locale(identifier: "en_US_POSIX")
        format.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        after = format.date(from: header)?.timeIntervalSinceNow
    }
    throw RetryableResponse(after: after.flatMap { $0.isFinite ? max(0, $0) : nil })
}
func recoverNetworkRead<T>(enabled: Bool = true, isolation: isolated (any Actor)? = #isolation, _ operation: () async throws -> T) async throws -> T {
    var delay = 1.0
    while true {
        try Task.checkCancellation()
        do { return try await operation() }
        catch {
            try Task.checkCancellation()
            let network = error as? URLError
            let transient = network.map { [.notConnectedToInternet, .networkConnectionLost, .timedOut,
                .cannotConnectToHost, .cannotFindHost, .dnsLookupFailed].contains($0.code) } ?? false
            let response = error as? RetryableResponse
            guard enabled && (transient || response != nil) else { throw error }
            let seconds = max(delay, response?.after ?? 0)
            try await Task.sleep(for: .seconds(seconds))
            delay = min(delay * 2, 30)
        }
    }
}
