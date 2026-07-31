import AVFoundation

@MainActor
final class AudioManager {
    private let engine = AVAudioEngine()

    func prepare() {
        // Audio graph setup will be implemented with AVAudioEngine later.
    }

    func stopAll() {
        engine.stop()
    }
}
