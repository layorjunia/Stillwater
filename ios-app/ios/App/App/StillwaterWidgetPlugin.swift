import Foundation
import Capacitor
import WidgetKit

/// Bridge the web app calls to push streak data into the App Group,
/// then nudge WidgetKit to redraw the Home Screen widget.
///
/// JS side:  window.Capacitor.Plugins.StillwaterWidget.update({...})
@objc(StillwaterWidgetPlugin)
public class StillwaterWidgetPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StillwaterWidgetPlugin"
    public let jsName = "StillwaterWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read",   returnType: CAPPluginReturnPromise)
    ]

    @objc func update(_ call: CAPPluginCall) {
        let incoming = StreakData(
            current:   call.getInt("current")    ?? 0,
            longest:   call.getInt("longest")    ?? 0,
            total:     call.getInt("total")      ?? 0,
            todayPct:  call.getInt("todayPct")   ?? 0,
            todayDone: call.getBool("todayDone") ?? false,
            updatedAt: call.getDouble("updatedAt") ?? Date().timeIntervalSince1970 * 1000
        )

        // Only touch WidgetKit when something actually changed — reloading
        // timelines is budgeted by the system.
        let changed = SharedStore.load() != incoming
        SharedStore.save(incoming)

        if changed {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve(["ok": true, "changed": changed])
    }

    @objc func read(_ call: CAPPluginCall) {
        let d = SharedStore.load()
        call.resolve([
            "current": d.current,
            "longest": d.longest,
            "total": d.total,
            "todayPct": d.todayPct,
            "todayDone": d.todayDone,
            "updatedAt": d.updatedAt
        ])
    }
}
