import SpriteKit

/// Platforms are static collision surfaces managed by the scene.
final class Platform: SKSpriteNode {
    init() {
        super.init(texture: nil, color: .darkGray, size: GameConstants.platformSize)

        let body = SKPhysicsBody(rectangleOf: size)
        body.isDynamic = false
        body.friction = 0
        body.restitution = 0
        body.categoryBitMask = PhysicsCategory.platform
        body.collisionBitMask = PhysicsCategory.player
        body.contactTestBitMask = PhysicsCategory.player
        physicsBody = body
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }
}
