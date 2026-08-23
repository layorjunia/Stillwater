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
   `group.com.illuminatedrones.stillwater` and calls `WidgetCenter.reloadAllTimelines()`
   — only when the values actually changed, since reloads are budgeted.
4. `StillwaterWidget.swift` reads the App Group and redraws. It also refreshes
   itself just after midnight so "today" resets without the app being opened.

On the web (no Capacitor) the same payload still lands in `localStorage`
under `stillwater_widget`, so nothing breaks.

## Identifiers

| | |
|---|---|
| App bundle id | `com.illuminatedrones.stillwater` |
| Widget bundle id | `com.illuminatedrones.stillwater.StillwaterWidget` |
| App Group | `group.com.illuminatedrones.stillwater` |
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

```bash
npm run sync
cd ios/App
xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
  -destination 'id=<device-udid>' -derivedDataPath /tmp/sw-dev build
xcrun devicectl device install app --device <device-id> \
  /tmp/sw-dev/Build/Products/Debug-iphoneos/App.app
```

Get `<device-udid>` from `xcodebuild -showdestinations` (hardware UDID) and
`<device-id>` from `xcrun devicectl list devices` (CoreDevice UUID) — they are
different identifiers for the same phone.

The one manual step is **trusting the developer cert on the phone**:
Settings ▸ General ▸ VPN & Device Management ▸ tap the developer ▸ Trust.
Until that is done the app installs but refuses to launch with
`FBSOpenApplicationErrorDomain error 3` ("...its profile has not been
explicitly trusted by the user"). This trust is per *certificate*, not per
app, and it can lapse — when it does, **every** dev-signed app on the phone
stops launching at once. That symptom means "go re-trust", not "the build
is broken".

### Why the identifiers are `com.illuminatedrones.*`

Signing originally failed with:

> An Application Group with identifier `group.com.stillwater.app` is not
> available. Please enter a different string.

and, once that was renamed, the same complaint about the bundle id
`com.stillwater.app`. Both generic `com.stillwater.*` strings are already
registered to **someone else's** Apple developer account, and identifiers are
globally unique across all of Apple. Nothing about the Xcode account, the
team, or the capability wiring was wrong — the strings simply were not
claimable.

Renaming both to the domain this team actually owns fixed it, and Xcode minted
the profiles immediately. So: **do not use bare `com.stillwater.*`**, and if a
new capability ever reports "not available", suspect a name collision before
suspecting the account.

Verify a build really carries the group with:

```bash
codesign -d --entitlements :- /tmp/sw-dev/Build/Products/Debug-iphoneos/App.app
```

An empty `<dict/>` there means the app group is missing and the widget will
read zeros.
