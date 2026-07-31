import SpriteKit
import UIKit

final class HUD: SKNode {
    private let scoreLabel = SKLabelNode(fontNamed: "AvenirNext-Bold")

    override init() {
        super.init()
        scoreLabel.text = "0"
        scoreLabel.horizontalAlignmentMode = .left
        scoreLabel.verticalAlignmentMode = .top
        addChild(scoreLabel)
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    func updateLayout(sceneSize: CGSize, safeAreaInsets: UIEdgeInsets) {
        scoreLabel.position = CGPoint(
            x: -sceneSize.width / 2 + safeAreaInsets.left + 16,
            y: sceneSize.height / 2 - safeAreaInsets.top - 16
        )
    }
}
