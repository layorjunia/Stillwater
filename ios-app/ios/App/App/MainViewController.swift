import UIKit
import Capacitor

/// Capacitor 6+ does not auto-discover plugins that live in the app target —
/// only ones shipped as Swift packages. App-local plugins must be registered
/// explicitly here, or `Capacitor.Plugins.StillwaterWidget` is undefined in JS.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(StillwaterWidgetPlugin())
    }
}
