import CoreGraphics

/// Shared tuning values keep the frame loop free of unexplained numbers.
enum GameConstants {
    static let preferredFramesPerSecond = 60
    static let gravity = CGVector(dx: 0, dy: -18)
    static let playerSize = CGSize(width: 65, height: 70)
    static let platformSize = CGSize(width: 220, height: 20)
    static let platformBottomMargin: CGFloat = 72
    static let horizontalSpeed: CGFloat = 220
    static let jumpVelocity: CGFloat = 620
    static let landingMaximumUpwardVelocity: CGFloat = 20
    static let horizontalEdgeInset: CGFloat = 8
    static let inputDragDistanceThreshold: CGFloat = 12
    static let inputTapMaximumDuration: Double = 0.35
}

/// A single category namespace prevents collision-mask values from drifting.
enum PhysicsCategory {
    static let player: UInt32 = 1 << 0
    static let platform: UInt32 = 1 << 1
    static let hazard: UInt32 = 1 << 2
    static let powerUp: UInt32 = 1 << 3
}

/// Named thresholds are the single source of truth for height-based evolution.
enum StageThresholds {
    static let sadPotato = 0
    static let happyPotato = 500
    static let workoutPotato = 2_000
    static let rippedPotato = 5_000
    static let opPotato = 10_000
}

enum EvolutionStage: Int, CaseIterable {
    case sadPotato = 1
    case happyPotato
    case workoutPotato
    case rippedPotato
    case opPotato

    var displayName: String {
        switch self {
        case .sadPotato: "Sad Potato"
        case .happyPotato: "Happy Potato"
        case .workoutPotato: "Workout Potato"
        case .rippedPotato: "Ripped Potato"
        case .opPotato: "OP Potato"
        }
    }

    var threshold: Int {
        switch self {
        case .sadPotato: StageThresholds.sadPotato
        case .happyPotato: StageThresholds.happyPotato
        case .workoutPotato: StageThresholds.workoutPotato
        case .rippedPotato: StageThresholds.rippedPotato
        case .opPotato: StageThresholds.opPotato
        }
    }

    var textureName: String {
        "potato-\(rawValue)"
    }
}

struct ProgressUpdate {
    let scoreChanged: Bool
    let stagesReached: [EvolutionStage]
}

/// Mutable input, height, score, and one-way stage state stays independent of nodes.
@MainActor
final class GameState {
    var horizontalInput: CGFloat = 0
    var isGrounded = false
    private(set) var score = 0
    private(set) var highestVerticalPosition: CGFloat = 0
    private(set) var currentStage = EvolutionStage.sadPotato
    private var scoringOrigin: CGFloat = 0

    func beginProgressTracking(at verticalPosition: CGFloat) {
        scoringOrigin = verticalPosition
        highestVerticalPosition = verticalPosition
        score = 0
        currentStage = .sadPotato
    }

    func record(verticalPosition: CGFloat) -> ProgressUpdate {
        guard verticalPosition > highestVerticalPosition else {
            return ProgressUpdate(scoreChanged: false, stagesReached: [])
        }

        highestVerticalPosition = verticalPosition
        let newScore = max(score, Int((verticalPosition - scoringOrigin).rounded(.down)))
        let scoreChanged = newScore > score
        score = newScore

        var reached: [EvolutionStage] = []
        while let nextStage = EvolutionStage(rawValue: currentStage.rawValue + 1), score >= nextStage.threshold {
            currentStage = nextStage
            reached.append(nextStage)
        }
        return ProgressUpdate(scoreChanged: scoreChanged, stagesReached: reached)
    }

    func resetInput() {
        horizontalInput = 0
    }
}
