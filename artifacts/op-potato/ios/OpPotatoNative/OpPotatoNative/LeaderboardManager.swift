import Foundation

struct LeaderboardEntry: Identifiable, Sendable {
    let id: UUID
    let playerName: String
    let score: Int
}

@MainActor
final class LeaderboardManager {
    private(set) var entries: [LeaderboardEntry] = []

    func fetchEntries() async throws {
        // Network integration will be implemented later.
    }

    func submit(score: Int, playerName: String) async throws {
        // Network integration will be implemented later.
    }
}
