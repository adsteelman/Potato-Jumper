import CoreGraphics

/// Shared tuning values keep the frame loop free of unexplained numbers.
enum GameConstants {
    static let preferredFramesPerSecond = 60
    static let gravity = CGVector(dx: 0, dy: -18)
    static let playerSize = CGSize(width: 65, height: 70)
    static let platformSize = CGSize(width: 220, height: 20)
    static let platformBottomMargin: CGFloat = 72
    static let horizontalSpeed: CGFloat = 220
    static let jumpImpulse: CGFloat = 620
    static let horizontalEdgeInset: CGFloat = 8
    static let jumpControlHeightRatio: CGFloat = 0.55
}

/// A single category namespace prevents collision-mask values from drifting.
enum PhysicsCategory {
    static let player: UInt32 = 1 << 0
    static let platform: UInt32 = 1 << 1
    static let hazard: UInt32 = 1 << 2
    static let powerUp: UInt32 = 1 << 3
}

/// Mutable input and contact state is independent of SpriteKit node ownership.
@MainActor
final class GameState {
    var horizontalInput: CGFloat = 0
    var isGrounded = false

    func resetInput() {
        horizontalInput = 0
    }
}
