import SpriteKit
import UIKit

/// The scene coordinates input, physics contacts, and the fixed 60 FPS update loop.
final class GameScene: SKScene, @MainActor SKPhysicsContactDelegate {
    private let gameState = GameState()
    private let potato = Potato()
    private let groundPlatform = Platform()
    private let cameraNode = SKCameraNode()
    private var movementTouches: [ObjectIdentifier: CGPoint] = [:]
    private var safeAreaInsets = UIEdgeInsets.zero

    override func didMove(to view: SKView) {
        backgroundColor = SKColor(red: 0.45, green: 0.78, blue: 0.96, alpha: 1)
        physicsWorld.gravity = GameConstants.gravity
        physicsWorld.contactDelegate = self
        view.preferredFramesPerSecond = GameConstants.preferredFramesPerSecond

        addChild(cameraNode)
        camera = cameraNode
        addChild(groundPlatform)
        addChild(potato)
        safeAreaInsets = view.safeAreaInsets
        layoutScene()
    }

    override func update(_ currentTime: TimeInterval) {
        potato.move(horizontalDirection: gameState.horizontalInput)
        clampPlayerToSceneBounds()
    }

    // Lower-screen touches hold left/right; an upper-screen touch requests a jump.
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let location = touch.location(in: self)
            if location.y >= size.height * GameConstants.jumpControlHeightRatio {
                attemptJump()
            } else {
                movementTouches[ObjectIdentifier(touch)] = location
            }
        }
        updateHorizontalInput()
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches where movementTouches[ObjectIdentifier(touch)] != nil {
            movementTouches[ObjectIdentifier(touch)] = touch.location(in: self)
        }
        updateHorizontalInput()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        removeMovementTouches(touches)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        removeMovementTouches(touches)
    }

    func didBegin(_ contact: SKPhysicsContact) {
        let categories = contact.bodyA.categoryBitMask | contact.bodyB.categoryBitMask
        let landingPair = PhysicsCategory.player | PhysicsCategory.platform
        if categories == landingPair, potato.physicsBody?.velocity.dy ?? 0 <= 0 {
            gameState.isGrounded = true
        }
    }

    func didEnd(_ contact: SKPhysicsContact) {
        let categories = contact.bodyA.categoryBitMask | contact.bodyB.categoryBitMask
        if categories == (PhysicsCategory.player | PhysicsCategory.platform) {
            gameState.isGrounded = false
        }
    }

    func updateSafeAreaInsets(_ insets: UIEdgeInsets) {
        safeAreaInsets = insets
        layoutScene()
    }

    override func didChangeSize(_ oldSize: CGSize) {
        super.didChangeSize(oldSize)
        layoutScene()
    }

    private func layoutScene() {
        guard size.width > 0, size.height > 0 else { return }
        cameraNode.position = CGPoint(x: size.width / 2, y: size.height / 2)
        groundPlatform.position = CGPoint(
            x: size.width / 2,
            y: safeAreaInsets.bottom + GameConstants.platformBottomMargin
        )
        if potato.parent != nil, potato.position == .zero {
            potato.position = CGPoint(x: size.width / 2, y: size.height / 2)
        }
    }

    private func updateHorizontalInput() {
        let centerX = size.width / 2
        let hasLeftTouch = movementTouches.values.contains { $0.x < centerX }
        let hasRightTouch = movementTouches.values.contains { $0.x >= centerX }
        gameState.horizontalInput = hasLeftTouch == hasRightTouch ? 0 : (hasLeftTouch ? -1 : 1)
    }

    private func removeMovementTouches(_ touches: Set<UITouch>) {
        for touch in touches {
            movementTouches.removeValue(forKey: ObjectIdentifier(touch))
        }
        updateHorizontalInput()
    }

    private func attemptJump() {
        guard gameState.isGrounded else { return }
        gameState.isGrounded = false
        potato.jump()
    }

    private func clampPlayerToSceneBounds() {
        let halfWidth = potato.size.width / 2
        let minimumX = safeAreaInsets.left + halfWidth + GameConstants.horizontalEdgeInset
        let maximumX = size.width - safeAreaInsets.right - halfWidth - GameConstants.horizontalEdgeInset
        potato.position.x = min(maximumX, max(minimumX, potato.position.x))
    }
}
