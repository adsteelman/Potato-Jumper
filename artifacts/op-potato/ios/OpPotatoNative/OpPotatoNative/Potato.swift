import SpriteKit

/// The player node owns its visual placeholder and physics configuration.
final class Potato: SKSpriteNode {
    init() {
        super.init(texture: nil, color: .brown, size: GameConstants.playerSize)

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

    func move(horizontalDirection: CGFloat) {
        physicsBody?.velocity.dx = horizontalDirection * GameConstants.horizontalSpeed
    }

    func jump() {
        physicsBody?.velocity.dy = 0
        physicsBody?.applyImpulse(CGVector(dx: 0, dy: GameConstants.jumpImpulse))
    }
}
