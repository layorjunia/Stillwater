#!/bin/bash
# Install Stillwater on Jacob's iPhone, with the Study Streak widget.
#
# Double-click this. It does, in order, and stops at the first thing that goes wrong:
#   1. backs up the phone's Stillwater data into backups/ (and stops if it cannot, so nothing is changed without one)
#   2. bundles the current web app into the native app
#   3. builds it, signed for the phone
#   4. installs it over the existing app (the app's data stays where it is)
#   5. checks the Study streak's path to the widget
#
# The phone must be awake and unlocked, and either plugged in or on the same Wi-Fi as this Mac.
# Everything it makes goes in the project's build/ folder.
set -u
cd "$(dirname "$0")" || exit 1
IOS="$(pwd)"; ROOT="$(cd .. && pwd)"
CORE_ID="4CEFC94E-E22D-5C9A-B14A-DDC94AE4E8C9"      # the phone, as devicectl names it
HW_ID="00008150-000548D13EDB401C"                    # the phone, as xcodebuild names it
BUNDLE="com.illuminatedrones.stillwater"
mkdir -p "$ROOT/build/logs" "$ROOT/build/DerivedData" "$ROOT/build/tmp"
LOG="$ROOT/build/logs/install-$(date +%Y%m%d-%H%M%S).log"
say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
stop() { printf '\n\033[1;31mStopped: %s\033[0m\nNothing was installed.\n' "$1"; printf '\nPress any key to close. '; read -n 1 -s; exit 1; }

say "1/5  Backing up the phone's Stillwater data first"
SNAP="$ROOT/backups/device-snapshot-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$SNAP"
if ! xcrun devicectl device copy from --device "$CORE_ID" --domain-type appDataContainer --domain-identifier "$BUNDLE" \
      --source "Library/WebKit/WebsiteData" --destination "$SNAP" 2>&1 | tee -a "$LOG" | grep -q "File received"; then
  rmdir "$SNAP" 2>/dev/null
  stop "could not back up the phone. Unlock it, keep it awake, plug it in or join the same Wi-Fi, and run this again."
fi
python3 "$ROOT/scripts/extract-snapshot.py" "$SNAP" | tee -a "$LOG"

say "2/5  Bundling the current web app into the native app"
( cd "$IOS" && npm run sync ) >>"$LOG" 2>&1 || stop "bundling failed. See $LOG"

say "3/5  Building for the phone (a few minutes)"
( cd "$IOS/ios/App" && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
    -destination "id=$HW_ID" -derivedDataPath "$ROOT/build/DerivedData" -allowProvisioningUpdates build ) >>"$LOG" 2>&1 \
  || stop "the build failed. See $LOG"
APP="$ROOT/build/DerivedData/Build/Products/Debug-iphoneos/App.app"
codesign -d --entitlements :- "$APP/PlugIns/StillwaterWidget.appex" 2>/dev/null | grep -q "group.com.illuminatedrones.stillwater" \
  || stop "the widget was built without its App Group, so it would show zeros. See $LOG"

say "4/5  Installing on the phone"
xcrun devicectl device install app --device "$CORE_ID" "$APP" 2>&1 | tee -a "$LOG" | tail -4
if ! grep -q "App installed" "$LOG"; then stop "the install did not finish. See $LOG"; fi

say "5/5  Checking the Study streak's path to the widget"
bash "$IOS/scripts/verify-study-widget.sh" 2>&1 | tee -a "$LOG" | grep -E "FAIL|ALL SWIFT|OK|SKIP|PASS  the phone"

cat <<'MSG'

Done. On the phone:
  1. Open Stillwater once (it writes the Study streak for the widget).
  2. Press and hold the Home Screen, tap +, choose Stillwater, then "Study Streak", and add it.
     The daily streak widget is still there too.

If the phone says the app can't be opened because its profile isn't trusted: unplug the cable and let it
reconnect over Wi-Fi. Do not go to VPN & Device Management; that does not fix it.
MSG
printf '\nPress any key to close. '; read -n 1 -s
