import SpriteKit

final class PowerUp: SKSpriteNode {
    static let physicsCategory: UInt32 = 1 << 4

    init(size: CGSize = CGSize(width: 36, height: 36)) {
        super.init(texture: nil, color: .green, size: size)
        physicsBody = SKPhysicsBody(circleOfRadius: min(size.width, size.height) / 2)
        physicsBody?.isDynamic = false
        physicsBody?.categoryBitMask = Self.physicsCategory
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }
}
