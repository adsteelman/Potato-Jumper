import SpriteKit
import UIKit

/// Camera-local labels remain fixed on screen while the world scrolls beneath them.
final class HUD: SKNode {
    private enum Layout {
        static let horizontalPadding: CGFloat = 16
        static let verticalPadding: CGFloat = 12
        static let fontSize: CGFloat = 20
    }

    private let scoreLabel = SKLabelNode(fontNamed: "AvenirNext-Bold")
    private let stageLabel = SKLabelNode(fontNamed: "AvenirNext-Bold")

    override init() {
        super.init()
        zPosition = 1_000

        scoreLabel.fontSize = Layout.fontSize
        scoreLabel.horizontalAlignmentMode = .left
        scoreLabel.verticalAlignmentMode = .top
        addChild(scoreLabel)

        stageLabel.fontSize = Layout.fontSize
        stageLabel.horizontalAlignmentMode = .right
        stageLabel.verticalAlignmentMode = .top
        addChild(stageLabel)
    }

    required init?(coder aDecoder: NSCoder) {
        super.init(coder: aDecoder)
    }

    func update(score: Int, stage: EvolutionStage) {
        scoreLabel.text = "Score: \(score)"
        stageLabel.text = "Stage \(stage.rawValue)"
    }

    func updateLayout(sceneSize: CGSize, safeAreaInsets: UIEdgeInsets) {
        let topY = sceneSize.height / 2 - safeAreaInsets.top - Layout.verticalPadding
        scoreLabel.position = CGPoint(
            x: -sceneSize.width / 2 + safeAreaInsets.left + Layout.horizontalPadding,
            y: topY
        )
        stageLabel.position = CGPoint(
            x: sceneSize.width / 2 - safeAreaInsets.right - Layout.horizontalPadding,
            y: topY
        )
    }
}
