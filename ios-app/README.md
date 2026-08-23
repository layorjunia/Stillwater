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

Two one-time prerequisites, both of which must be done by a human:

1. **Sign in to Xcode.** Xcode ▸ Settings ▸ Accounts ▸ **+** ▸ Apple ID.
   Without an account, Xcode cannot create a profile that carries the
   App Groups capability, and the build fails with:

   > Provisioning profile "iOS Team Provisioning Profile: \*" doesn't include
   > the App Groups capability.

2. **Trust the developer cert on the phone.** After the first install:
   Settings ▸ General ▸ VPN & Device Management ▸ tap the developer app ▸ Trust.
   Until this is done the app installs but refuses to launch with
   `FBSOpenApplicationErrorDomain error 3`.

Then:

```bash
npm run sync
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=<device-udid>' -derivedDataPath /tmp/sw-dev \
  -allowProvisioningUpdates build
xcrun devicectl device install app --device <device-id> \
  /tmp/sw-dev/Build/Products/Debug-iphoneos/App.app
```

Get `<device-udid>` from `xcodebuild -showdestinations` (hardware UDID) and
`<device-id>` from `xcrun devicectl list devices` (CoreDevice UUID) — they are
different identifiers for the same phone.

### Installing before step 1 is done

The app can be built and installed without the App Group by pointing both
targets at an empty entitlements file. Everything works except the widget's
data, which will read zeros:

```bash
printf '%s\n' '<?xml version="1.0" encoding="UTF-8"?>' \
  '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">' \
  '<plist version="1.0"><dict/></plist>' > /tmp/Empty.entitlements

xcodebuild ... CODE_SIGN_ENTITLEMENTS=/tmp/Empty.entitlements build
```

This is a command-line override only — the committed project keeps the real
entitlements. A free provisioning profile expires after 7 days; the paid
program does not.
