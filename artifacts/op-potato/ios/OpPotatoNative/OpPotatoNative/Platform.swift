import SpriteKit

/// Visual types share one collision contract; healing behavior is intentionally deferred.
final class Platform: SKSpriteNode {
    enum Kind: CaseIterable {
        case cuttingBoard
        case bakingSheet
        case countertop
        case healing

        var baseSize: CGSize {
            switch self {
            case .cuttingBoard: CGSize(width: 150, height: 18)
            case .bakingSheet: CGSize(width: 130, height: 16)
            case .countertop: CGSize(width: 175, height: 20)
            case .healing: CGSize(width: 120, height: 18)
            }
        }

        var color: SKColor {
            switch self {
            case .cuttingBoard: .brown
            case .bakingSheet: .lightGray
            case .countertop: SKColor(white: 0.08, alpha: 1)
            case .healing: .systemGreen
            }
        }
    }

    let kind: Kind

    init(kind: Kind, widthScale: CGFloat = 1) {
        self.kind = kind
        let baseSize = kind.baseSize
        let scaledSize = CGSize(width: baseSize.width * widthScale, height: baseSize.height)
        super.init(texture: nil, color: kind.color, size: scaledSize)

        let body = SKPhysicsBody(rectangleOf: scaledSize)
        body.isDynamic = false
        body.friction = 0
        body.restitution = 0
        body.categoryBitMask = PhysicsCategory.platform
        body.collisionBitMask = PhysicsCategory.player
        body.contactTestBitMask = PhysicsCategory.player
        physicsBody = body
    }

    required init?(coder aDecoder: NSCoder) {
        nil
    }
}
