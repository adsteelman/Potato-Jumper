import SpriteKit
import UIKit

/// The player owns fixed geometry; evolution swaps only its transparent texture.
final class Potato: SKSpriteNode {
    private static var evolutionTextures: [EvolutionStage: SKTexture] = [:]

    init() {
        super.init(texture: nil, color: .clear, size: GameConstants.playerSize)
        zPosition = 10
        alpha = 1
        xScale = 1
        yScale = 1
        isHidden = false

        let body = SKPhysicsBody(rectangleOf: size)
        body.allowsRotation = false
        body.mass = 1
        body.friction = 0
        body.restitution = 0
        body.linearDamping = 0
        body.categoryBitMask = PhysicsCategory.player
        body.collisionBitMask = PhysicsCategory.platform
        body.contactTestBitMask = PhysicsCategory.platform
        physicsBody = body
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    static func preloadEvolutionTextures(completion: @escaping @MainActor @Sendable () -> Void) {
        var loadedTextures: [EvolutionStage: SKTexture] = [:]
        for stage in EvolutionStage.allCases {
            guard let image = UIImage(named: stage.textureName) else {
                print("[TEXTURE ERROR] Missing required potato texture: \(stage.textureName)")
                continue
            }
            loadedTextures[stage] = SKTexture(image: image)
        }

        evolutionTextures = loadedTextures
        let textures = Array(loadedTextures.values)
        guard !textures.isEmpty else {
            completion()
            return
        }
        SKTexture.preload(textures) {
            Task { @MainActor in
                completion()
            }
        }
    }

    func applyEvolutionTexture(for stage: EvolutionStage) {
        guard let stageTexture = Self.evolutionTextures[stage] else {
            print("[TEXTURE ERROR] Cannot apply missing potato texture: \(stage.textureName)")
            return
        }
        texture = stageTexture
    }

    func move(horizontalDirection: CGFloat) {
        physicsBody?.velocity.dx = horizontalDirection * GameConstants.horizontalSpeed
    }

    func jump() {
        physicsBody?.velocity.dy = 0
        physicsBody?.applyImpulse(CGVector(dx: 0, dy: GameConstants.jumpImpulse))
    }
}
