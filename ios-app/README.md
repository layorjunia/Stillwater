# Stillwater — iOS app

Native shell around the single-file web app, plus a real SwiftUI Home Screen /
Lock Screen widget for the daily streak.

```
ios-app/
├─ scripts/
│  ├─ bundle-web.js        copies ../Stillwater.html + ../vendor → www/
│  └─ add_widget_target.rb recreates the widget target in the Xcode project
├─ www/                    generated; not committed
└─ ios/App/
   ├─ App.xcodeproj
   ├─ App/                 app target (+ StillwaterWidgetPlugin.swift)
   ├─ Shared/              StillwaterShared.swift — compiled into BOTH targets
   └─ StillwaterWidget/    WidgetKit extension
```

## Everyday loop

Edit `../Stillwater.html` as usual (it is still the web app), then:

```bash
cd ios-app
npm run sync      # bundle web assets + npx cap sync ios
npm run open      # open Xcode, then ⌘R
```

## How the widget gets its data

1. The web app computes streaks and calls `syncWidgetData()`.
2. That calls `Capacitor.Plugins.StillwaterWidget.update({...})`.
3. `StillwaterWidgetPlugin.swift` writes it to the App Group
   `group.com.stillwater.app` and calls `WidgetCenter.reloadAllTimelines()`
   — only when the values actually changed, since reloads are budgeted.
4. `StillwaterWidget.swift` reads the App Group and redraws. It also refreshes
   itself just after midnight so "today" resets without the app being opened.

On the web (no Capacitor) the same payload still lands in `localStorage`
under `stillwater_widget`, so nothing breaks.

## Identifiers

| | |
|---|---|
| App bundle id | `com.stillwater.app` |
| Widget bundle id | `com.stillwater.app.StillwaterWidget` |
| App Group | `group.com.stillwater.app` |
| Team | `B4U26FR445` |

Change the bundle ids in `capacitor.config.json` **and**
`scripts/add_widget_target.rb`, then re-run the Ruby script.

## Rebuilding the widget target

`npx cap sync` can rewrite the Xcode project. If the widget target ever
disappears, put it back with:

```bash
GEM_HOME="/opt/homebrew/Cellar/cocoapods/1.17.0/libexec" \
  ruby scripts/add_widget_target.rb
```

The script is idempotent — it removes any existing widget target first.
It uses the `xcodeproj` gem that ships inside CocoaPods, which is why the
`GEM_HOME` override is needed.

## Offline

The Firebase SDK is vendored in `../vendor/` rather than loaded from the CDN,
so the app boots and runs with no network. Firestore offline persistence is
enabled, so writes queue locally and flush on reconnect.

## Shipping to a device

Open the project, select your team on both targets, and register the App Group
on the Apple Developer portal for both bundle ids. Then run on the device.
A free provisioning profile expires after 7 days; the paid program does not.
