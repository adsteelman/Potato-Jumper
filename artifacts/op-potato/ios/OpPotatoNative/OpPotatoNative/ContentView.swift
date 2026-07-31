import SpriteKit
import SwiftUI
import UIKit

struct ContentView: UIViewControllerRepresentable {
    func makeUIViewController(context: Context) -> GameViewController {
        GameViewController()
    }

    func updateUIViewController(_ viewController: GameViewController, context: Context) {}
}

final class GameViewController: UIViewController {
    private let gameView = SKView(frame: .zero)
    private let gameScene = GameScene(size: CGSize(width: 420, height: 760))

    override func loadView() {
        view = gameView
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        gameScene.scaleMode = .resizeFill
        gameView.presentScene(gameScene)
    }

    override func viewSafeAreaInsetsDidChange() {
        super.viewSafeAreaInsetsDidChange()
        gameScene.updateSafeAreaInsets(view.safeAreaInsets)
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        .portrait
    }
}
