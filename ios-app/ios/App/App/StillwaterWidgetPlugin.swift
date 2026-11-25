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
            updatedAt: call.getDouble("updatedAt") ?? Date().timeIntervalSince1970 * 1000,
            // These two are what let the widget reset itself at midnight. They
            // were being dropped here, so the App Group only ever received the
            // old shape and the widget could never tell the data was stale.
            dayKey: call.getString("dayKey"),
            lastDoneDay: call.getString("lastDoneDay")
        )

        // Only touch WidgetKit when something actually changed — reloading
        // timelines is budgeted by the system.
        var changed = SharedStore.load() != incoming
        SharedStore.save(incoming)

        // The Study streak travels in the same call under its own names. An older web page does not send it, and
        // then the stored one is left exactly as it was.
        if call.getInt("studyCurrent") != nil {
            let study = StudyData(
                current: call.getInt("studyCurrent") ?? 0,
                longest: call.getInt("studyLongest") ?? 0,
                total:   call.getInt("studyTotal")   ?? 0,
                today:   call.getInt("studyToday")   ?? 0,
                done:    call.getBool("studyDone")   ?? false,
                updatedAt: call.getDouble("updatedAt") ?? Date().timeIntervalSince1970 * 1000,
                dayKey: call.getString("studyDayKey"),
                lastDoneDay: call.getString("studyLastDoneDay")
            )
            if SharedStore.loadStudy() != study { changed = true }
            SharedStore.saveStudy(study)
        }

        // The Learn streak and the week strip travel in the same call too, under their own names; an older page does not
        // send them and the stored ones are then left alone.
        if call.getInt("learnCurrent") != nil {
            let learn = LearnData(
                current:  call.getInt("learnCurrent") ?? 0,
                longest:  call.getInt("learnLongest") ?? 0,
                total:    call.getInt("learnTotal")   ?? 0,
                todayPct: call.getInt("learnPct")     ?? 0,
                done:     call.getBool("learnDone")   ?? false,
                updatedAt: call.getDouble("updatedAt") ?? Date().timeIntervalSince1970 * 1000,
                dayKey: call.getString("learnDayKey"),
                lastDoneDay: call.getString("learnLastDoneDay")
            )
            if SharedStore.loadLearn() != learn { changed = true }
            SharedStore.saveLearn(learn)
        }
        if let wd = call.getString("weekDaily") {
            func keys(_ s: String?) -> [String] { (s ?? "").split(separator: ",").map(String.init).filter { !$0.isEmpty } }
            let week = WeekData(daily: keys(wd), study: keys(call.getString("weekStudy")), learn: keys(call.getString("weekLearn")))
            if SharedStore.loadWeek() != week { changed = true }
            SharedStore.saveWeek(week)
        }

        if changed {
            WidgetCenter.shared.reloadAllTimelines()
        }
        call.resolve(["ok": true, "changed": changed])
    }

    @objc func read(_ call: CAPPluginCall) {
        let d = SharedStore.load()
        let s = SharedStore.loadStudy()
        let l = SharedStore.loadLearn()
        let w = SharedStore.loadWeek()
        call.resolve([
            "learnCurrent": l.current,
            "learnLongest": l.longest,
            "learnTotal": l.total,
            "learnPct": l.todayPct,
            "learnDone": l.done,
            "learnDayKey": l.dayKey ?? "",
            "learnLastDoneDay": l.lastDoneDay ?? "",
            "weekDaily": w.daily.joined(separator: ","),
            "weekStudy": w.study.joined(separator: ","),
            "weekLearn": w.learn.joined(separator: ","),
            "studyCurrent": s.current,
            "studyLongest": s.longest,
            "studyTotal": s.total,
            "studyToday": s.today,
            "studyDone": s.done,
            "studyDayKey": s.dayKey ?? "",
            "studyLastDoneDay": s.lastDoneDay ?? "",
            "current": d.current,
            "longest": d.longest,
            "total": d.total,
            "todayPct": d.todayPct,
            "todayDone": d.todayDone,
            "updatedAt": d.updatedAt,
            "dayKey": d.dayKey ?? "",
            "lastDoneDay": d.lastDoneDay ?? ""
        ])
    }
}
