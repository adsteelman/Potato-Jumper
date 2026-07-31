import SpriteKit

final class Fry: SKSpriteNode {
    static let physicsCategory: UInt32 = 1 << 1

    init(size: CGSize = CGSize(width: 65, height: 70)) {
        super.init(texture: nil, color: .yellow, size: size)
        physicsBody = SKPhysicsBody(rectangleOf: size)
        physicsBody?.categoryBitMask = Self.physicsCategory
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }
}
