import Foundation
import KitNet
import KitCore

// URLSession's connection limit is per host (and HTTP/2 multiplexes requests). Hitomi's
// image hosts share a limit on this network: use one admission queue across both hosts.
// Speculation leaves room for the screen; a server cooldown applies to the whole queue.
actor ImageTransferGate {
    private struct Rank {
        var priority: Float
        var interactive: Bool
    }
    private struct Waiter {
        let id: UUID
        let continuation: CheckedContinuation<Void, Error>
        var rank: Rank
    }
    private let limit: Int
    private let speculativeLimit: Int
    private let firstCooldown: TimeInterval
    private var active: [UUID: Rank] = [:]
    private var waiting: [Waiter] = []
    private var promoted: [UUID: Rank] = [:]
    private var blockedUntil = Date.distantPast
    private var throttleStreak = 0
    private var wake: Task<Void, Never>?
    private var throttles = 0
    private var peak = 0

    init(limit: Int, speculativeLimit: Int, firstCooldown: TimeInterval = 2) {
        self.limit = limit
        self.speculativeLimit = min(speculativeLimit, limit)
        self.firstCooldown = firstCooldown
    }

    func acquire(_ id: UUID, priority: Float, speculative: Bool) async throws {
        try await withTaskCancellationHandler {
            try Task.checkCancellation()
            try await withCheckedThrowingContinuation { continuation in
                waiting.append(Waiter(id: id, continuation: continuation,
                                      rank: promoted[id] ?? Rank(priority: priority, interactive: !speculative)))
                pump()
            }
        } onCancel: { Task { await self.cancel(id) } }
    }

    func promote(_ id: UUID, priority: Float, interactive: Bool) {
        let previous = promoted[id]
        let rank = Rank(priority: max(priority, previous?.priority ?? 0), interactive: interactive || previous?.interactive == true)
        promoted[id] = rank
        if let index = waiting.firstIndex(where: { $0.id == id }) { waiting[index].rank = rank }
        if active[id] != nil { active[id] = rank }
        pump()
    }

    func release(_ id: UUID, error: Error? = nil) {
        active[id] = nil
        if let error = error as? HTTPStatusError, [429, 503].contains(error.status) {
            throttles += 1
            throttleStreak += 1
            let delay = max(error.retryAfter ?? 0, min(30, firstCooldown * pow(2, Double(min(throttleStreak - 1, 4)))))
            blockedUntil = max(blockedUntil, Date().addingTimeInterval(delay))
            Log.network.info("Image HTTP \(error.status): shared cooldown \(delay)s; limit \(self.limit)")
        } else if error == nil, Date() >= blockedUntil {
            throttleStreak = 0
        }
        pump()
    }

    func forget(_ id: UUID) { promoted[id] = nil }

    private func cancel(_ id: UUID) {
        guard let index = waiting.firstIndex(where: { $0.id == id }) else { return }
        waiting.remove(at: index).continuation.resume(throwing: CancellationError())
        pump()
    }

    private func pump() {
        guard !waiting.isEmpty else { wake?.cancel(); wake = nil; return }
        let delay = blockedUntil.timeIntervalSinceNow
        if delay > 0 {
            // Reschedule for the newest deadline (another 503 can extend it).
            wake?.cancel()
            wake = Task {
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
                self.pump()
            }
            return
        }
        wake?.cancel(); wake = nil
        while active.count < limit {
            let ahead = active.values.filter { !$0.interactive }.count
            let candidates = waiting.indices.filter { waiting[$0].rank.interactive || ahead < speculativeLimit }
            guard let index = candidates.max(by: { a, b in
                let x = waiting[a].rank, y = waiting[b].rank
                if x.interactive != y.interactive { return !x.interactive }
                if x.priority != y.priority { return x.priority < y.priority }
                return a > b // FIFO within a priority.
            }) else { return }
            let next = waiting.remove(at: index)
            active[next.id] = next.rank
            peak = max(peak, active.count)
            next.continuation.resume()
        }
    }

    var state: [String: Int] {
        ["limit": limit, "speculativeLimit": speculativeLimit, "active": active.count,
         "queued": waiting.count, "peak": peak, "throttles": throttles,
         "cooldownSeconds": Int(ceil(max(0, blockedUntil.timeIntervalSinceNow)))]
    }
}
