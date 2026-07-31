import Foundation

@MainActor
final class StageManager {
    private(set) var currentStage = 1

    func reset() {
        currentStage = 1
    }
}
