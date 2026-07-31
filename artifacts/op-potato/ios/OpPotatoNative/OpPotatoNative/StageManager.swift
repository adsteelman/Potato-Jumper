import SpriteKit

/// Maintains a bounded, constant-density platform band around the camera.
@MainActor
final class StageManager {
    private enum Tuning {
        static let minimumVerticalSpacing: CGFloat = 96
        static let maximumVerticalSpacing: CGFloat = 122
        static let horizontalMargin: CGFloat = 24
        static let spawnBufferScreens: CGFloat = 0.8
        static let despawnBufferScreens: CGFloat = 1.2
        static let difficultyDistance: CGFloat = 6_000
        static let minimumWidthScale: CGFloat = 0.72
        static let maximumSpawnsPerFrame = 16
    }

    private weak var scene: SKScene?
    private var platforms: [Platform] = []
    private var highestPlatformY: CGFloat = 0
    private var startingHeight: CGFloat = 0

    func configure(in scene: SKScene, sceneWidth: CGFloat, startingY: CGFloat) -> Platform {
        self.scene = scene
        startingHeight = startingY
        highestPlatformY = startingY

        let startingPlatform = Platform(kind: .cuttingBoard)
        startingPlatform.position = CGPoint(x: sceneWidth / 2, y: startingY)
        scene.addChild(startingPlatform)
        platforms = [startingPlatform]
        return startingPlatform
    }

    func update(cameraY: CGFloat, sceneSize: CGSize) {
        guard scene != nil else { return }

        let visibleTop = cameraY + sceneSize.height / 2
        let spawnLimit = visibleTop + sceneSize.height * Tuning.spawnBufferScreens
        var spawned = 0
        while highestPlatformY < spawnLimit, spawned < Tuning.maximumSpawnsPerFrame {
            spawnPlatform(sceneWidth: sceneSize.width, cameraY: cameraY)
            spawned += 1
        }

        let despawnLimit = cameraY - sceneSize.height * Tuning.despawnBufferScreens
        platforms.removeAll { platform in
            guard platform.position.y < despawnLimit else { return false }
            platform.removeFromParent()
            return true
        }
    }

    private func spawnPlatform(sceneWidth: CGFloat, cameraY: CGFloat) {
        guard let scene else { return }

        // Spacing stays constant; difficulty increases through narrower, less forgiving types.
        let difficulty = min(1, max(0, (cameraY - startingHeight) / Tuning.difficultyDistance))
        let widthScale = 1 - difficulty * (1 - Tuning.minimumWidthScale)
        let kind = randomKind(difficulty: difficulty)
        let platform = Platform(kind: kind, widthScale: widthScale)
        let halfWidth = platform.size.width / 2
        let minimumX = Tuning.horizontalMargin + halfWidth
        let maximumX = sceneWidth - Tuning.horizontalMargin - halfWidth
        let x = maximumX > minimumX ? CGFloat.random(in: minimumX...maximumX) : sceneWidth / 2
        let spacing = CGFloat.random(in: Tuning.minimumVerticalSpacing...Tuning.maximumVerticalSpacing)

        highestPlatformY += spacing
        platform.position = CGPoint(x: x, y: highestPlatformY)
        scene.addChild(platform)
        platforms.append(platform)
    }

    private func randomKind(difficulty: CGFloat) -> Platform.Kind {
        let roll = CGFloat.random(in: 0..<1)
        if roll < 0.06 { return .healing }
        if roll < 0.30 + difficulty * 0.12 { return .bakingSheet }
        if roll < 0.55 + difficulty * 0.20 { return .countertop }
        return .cuttingBoard
    }
}
