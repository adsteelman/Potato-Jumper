import SpriteKit

final class Hazard: SKSpriteNode {
    static let physicsCategory: UInt32 = 1 << 3

    init(size: CGSize = CGSize(width: 48, height: 48)) {
        super.init(texture: nil, color: .red, size: size)
        physicsBody = SKPhysicsBody(rectangleOf: size)
        physicsBody?.isDynamic = false
        physicsBody?.categoryBitMask = Self.physicsCategory
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }
}
