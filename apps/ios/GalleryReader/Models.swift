import Foundation

enum ReaderError: LocalizedError {
    case invalidRequest, badResponse(Int)
    var errorDescription: String? {
        switch self { case .invalidRequest: return "Invalid reader request"; case .badResponse(let code): return "Image request failed (HTTP \(code))" }
    }
}
