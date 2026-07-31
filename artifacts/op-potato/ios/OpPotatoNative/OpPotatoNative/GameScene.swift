import SpriteKit
import UIKit

/// The scene coordinates input, physics contacts, and the fixed 60 FPS update loop.
final class GameScene: SKScene, @MainActor SKPhysicsContactDelegate {
    private struct TrackedTouch {
        let startLocation: CGPoint
        let startTimestamp: TimeInterval
        var currentLocation: CGPoint
        var isDrag = false
    }

    private let gameState = GameState()
    private let potato = Potato()
    private let stageManager = StageManager()
    private let cameraNode = SKCameraNode()
    private let hud = HUD()
    private let playerPositionDebugNode = SKShapeNode(rectOf: GameConstants.playerSize)
    private var trackedTouches: [ObjectIdentifier: TrackedTouch] = [:]
    private var gameplayActive = false
    private var safeAreaInsets = UIEdgeInsets.zero
    private var gameplayReady = false
    private var texturesReady = false
    private var worldSetupComplete = false
    private var startupLogPrinted = false

    override func didMove(to view: SKView) {
        backgroundColor = SKColor(red: 0.45, green: 0.78, blue: 0.96, alpha: 1)
        physicsWorld.gravity = GameConstants.gravity
        physicsWorld.contactDelegate = self
        view.preferredFramesPerSecond = GameConstants.preferredFramesPerSecond

        addChild(cameraNode)
        camera = cameraNode
        cameraNode.addChild(hud)
        playerPositionDebugNode.fillColor = .red
        playerPositionDebugNode.strokeColor = .red
        playerPositionDebugNode.zPosition = 9
        addChild(playerPositionDebugNode)
        addChild(potato)
        safeAreaInsets = view.safeAreaInsets
        isPaused = true
        layoutScene()
        setUpWorldIfPossible()
        Potato.preloadEvolutionTextures { [weak self] in
            guard let self else { return }
            self.potato.applyEvolutionTexture(for: .sadPotato)
            self.texturesReady = true
            self.finishStartupIfReady()
        }
    }

    override func update(_ currentTime: TimeInterval) {
        guard gameplayReady else { return }
        potato.move(horizontalDirection: gameState.horizontalInput)
        clampPlayerToSceneBounds()
        updateProgression()
        followPlayerUpward()
        stageManager.update(cameraY: cameraNode.position.y, sceneSize: size)
    }

    // A short stationary touch jumps; crossing the movement threshold becomes a drag.
    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent?) {
        guard gameplayReady else { return }
        for touch in touches {
            let location = touch.location(in: self)
            guard !isTouchInHUD(location) else { continue }
            trackedTouches[ObjectIdentifier(touch)] = TrackedTouch(
                startLocation: location,
                startTimestamp: touch.timestamp,
                currentLocation: location
            )
            print("[INPUT] began")
        }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent?) {
        for touch in touches {
            let identifier = ObjectIdentifier(touch)
            guard var trackedTouch = trackedTouches[identifier] else { continue }
            trackedTouch.currentLocation = touch.location(in: self)
            let distance = hypot(
                trackedTouch.currentLocation.x - trackedTouch.startLocation.x,
                trackedTouch.currentLocation.y - trackedTouch.startLocation.y
            )
            if !trackedTouch.isDrag, distance >= GameConstants.inputDragDistanceThreshold {
                trackedTouch.isDrag = true
                print("[INPUT] classified=drag")
            }
            trackedTouches[identifier] = trackedTouch
        }
        updateHorizontalInput()
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent?) {
        finishTouches(touches, allowTap: true)
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent?) {
        finishTouches(touches, allowTap: false)
    }

    func didBegin(_ contact: SKPhysicsContact) {
        guard let platform = platformNode(in: contact) else { return }
        let verticalVelocity = potato.physicsBody?.velocity.dy ?? 0
        let isFallingOrNearlyStill = verticalVelocity <= GameConstants.landingMaximumUpwardVelocity
        let isAbovePlatform = potato.position.y > platform.position.y
        guard isFallingOrNearlyStill, isAbovePlatform else { return }

        gameState.isGrounded = true
        print("[JUMP] landing detected velocityY=\(verticalVelocity) grounded=\(gameState.isGrounded)")
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
        cameraNode.position.x = size.width / 2
        if cameraNode.position.y == 0 {
            cameraNode.position.y = size.height / 2
        }
        hud.updateLayout(sceneSize: size, safeAreaInsets: safeAreaInsets)
        setUpWorldIfPossible()
    }

    private func updateHorizontalInput() {
        let centerX = size.width / 2
        let dragLocations = trackedTouches.values.filter(\.isDrag).map(\.currentLocation)
        let hasLeftTouch = dragLocations.contains { $0.x < centerX }
        let hasRightTouch = dragLocations.contains { $0.x >= centerX }
        gameState.horizontalInput = hasLeftTouch == hasRightTouch ? 0 : (hasLeftTouch ? -1 : 1)
    }

    private func finishTouches(_ touches: Set<UITouch>, allowTap: Bool) {
        for touch in touches {
            guard let trackedTouch = trackedTouches.removeValue(forKey: ObjectIdentifier(touch)) else { continue }
            let duration = touch.timestamp - trackedTouch.startTimestamp
            let isTap = allowTap && !trackedTouch.isDrag && duration <= GameConstants.inputTapMaximumDuration
            guard isTap else {
                if !trackedTouch.isDrag {
                    print("[INPUT] classified=drag")
                }
                continue
            }

            print("[INPUT] classified=tap")
            if !gameplayActive {
                gameplayActive = true
                continue
            }
            print("[JUMP] requested velocityY=\(potato.physicsBody?.velocity.dy ?? 0) grounded=\(gameState.isGrounded)")
            attemptJump()
        }
        updateHorizontalInput()
    }

    private func isTouchInHUD(_ sceneLocation: CGPoint) -> Bool {
        let cameraLocation = cameraNode.convert(sceneLocation, from: self)
        return hud.calculateAccumulatedFrame().contains(cameraLocation)
    }

    private func attemptJump() {
        guard gameState.isGrounded else {
            print("[JUMP] rejected velocityY=\(potato.physicsBody?.velocity.dy ?? 0) grounded=false")
            return
        }
        gameState.isGrounded = false
        potato.jump()
        print("[JUMP] accepted velocityY=\(potato.physicsBody?.velocity.dy ?? 0) grounded=\(gameState.isGrounded)")
    }

    private func platformNode(in contact: SKPhysicsContact) -> SKNode? {
        let playerBody: SKPhysicsBody
        let platformBody: SKPhysicsBody
        if contact.bodyA.categoryBitMask == PhysicsCategory.player,
           contact.bodyB.categoryBitMask == PhysicsCategory.platform {
            playerBody = contact.bodyA
            platformBody = contact.bodyB
        } else if contact.bodyB.categoryBitMask == PhysicsCategory.player,
                  contact.bodyA.categoryBitMask == PhysicsCategory.platform {
            playerBody = contact.bodyB
            platformBody = contact.bodyA
        } else {
            return nil
        }
        guard playerBody.node === potato else { return nil }
        return platformBody.node
    }

    private func clampPlayerToSceneBounds() {
        let halfWidth = potato.size.width / 2
        let minimumX = safeAreaInsets.left + halfWidth + GameConstants.horizontalEdgeInset
        let maximumX = size.width - safeAreaInsets.right - halfWidth - GameConstants.horizontalEdgeInset
        potato.position.x = min(maximumX, max(minimumX, potato.position.x))
    }

    private func followPlayerUpward() {
        let desiredCameraY = potato.position.y - size.height * 0.12
        cameraNode.position.y = max(cameraNode.position.y, desiredCameraY)
    }

    private func updateProgression() {
        let progress = gameState.record(verticalPosition: potato.position.y)
        for stage in progress.stagesReached {
            potato.applyEvolutionTexture(for: stage)
            print("[PROGRESSION] Reached stage \(stage.rawValue): \(stage.displayName)")
        }
        if progress.scoreChanged || !progress.stagesReached.isEmpty {
            hud.update(score: gameState.score, stage: gameState.currentStage)
        }
    }

    private func setUpWorldIfPossible() {
        guard !worldSetupComplete, size.width > 0, size.height > 0 else { return }
        worldSetupComplete = true

        let startingY = safeAreaInsets.bottom + GameConstants.platformBottomMargin
        _ = stageManager.configure(in: self, sceneWidth: size.width, startingY: startingY)
        potato.position = cameraNode.position
        playerPositionDebugNode.position = potato.position
        gameState.beginProgressTracking(at: potato.position.y)
        hud.update(score: gameState.score, stage: gameState.currentStage)
        stageManager.update(cameraY: cameraNode.position.y, sceneSize: size)
        finishStartupIfReady()
    }

    private func finishStartupIfReady() {
        guard worldSetupComplete, texturesReady else { return }
        let visibleBounds = CGRect(
            x: cameraNode.position.x - size.width / 2,
            y: cameraNode.position.y - size.height / 2,
            width: size.width,
            height: size.height
        )
        if !startupLogPrinted {
            startupLogPrinted = true
            let parentName = potato.parent.map { String(describing: type(of: $0)) } ?? "nil"
            print("[PLAYER STARTUP] anchor=\(anchorPoint) sceneSize=\(size) scaleMode=\(scaleMode) camera=\(cameraNode.position) visibleBounds=\(visibleBounds) playerPosition=\(potato.position) playerSize=\(potato.size) parent=\(parentName) alpha=\(potato.alpha) scale=(\(potato.xScale), \(potato.yScale)) hidden=\(potato.isHidden) zPosition=\(potato.zPosition)")
        }
        gameplayReady = true
        isPaused = false
    }
}
