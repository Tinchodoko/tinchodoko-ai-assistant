// Generated build-history fallback. Keeps the APP changelog available when GitHub Actions API is unavailable or rate-limited.
export type BuildHistoryEntry = { run_number:number; conclusion:string|null; status:string; display_title:string };
export const BUILD_HISTORY_FALLBACK: BuildHistoryEntry[] = [
  {
    "run_number": 0,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Initial Android foundation: Connection and Profile screens."
  },
  {
    "run_number": 1,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add Android debug build workflow"
  },
  {
    "run_number": 2,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix Exness empty-body SHA-256 signing"
  },
  {
    "run_number": 3,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Remove committed Exness credentials from config template"
  },
  {
    "run_number": 4,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add local credential and build ignores"
  },
  {
    "run_number": 5,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add build metadata template"
  },
  {
    "run_number": 6,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add build changelog registry"
  },
  {
    "run_number": 7,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add APP tab, update checker and build changelog UI"
  },
  {
    "run_number": 8,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Automate build versions, changelog and app metadata"
  },
  {
    "run_number": 9,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix CI dependency setup without lockfile"
  },
  {
    "run_number": 10,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix TypeScript syntax in Exness client"
  },
  {
    "run_number": 11,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix build metadata generation and Expo CI mode"
  },
  {
    "run_number": 12,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix changelog formatting and serialize Android builds"
  },
  {
    "run_number": 13,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix generated buildInfo newline"
  },
  {
    "run_number": 14,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Scope TypeScript checks to Expo app sources"
  },
  {
    "run_number": 15,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix Web Crypto BufferSource typing"
  },
  {
    "run_number": 16,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "ci: publish successful APKs as GitHub Releases and restore V0-V15 cha…"
  },
  {
    "run_number": 17,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(ci): correct shell escaping for changelog and build metadata"
  },
  {
    "run_number": 18,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "ci(android): sign release APKs with persistent keystore"
  },
  {
    "run_number": 19,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(ci): normalize workflow escape sequences"
  },
  {
    "run_number": 20,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(ci): preserve keystore path between release signing steps"
  },
  {
    "run_number": 21,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(ci): support Expo generated Gradle signing layout"
  },
  {
    "run_number": 22,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(ci): correct Gradle block parser escapes"
  },
  {
    "run_number": 23,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(ci): support current apksigner certificate output"
  },
  {
    "run_number": 24,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(ci): correctly extract v2 signer certificate fingerprint"
  },
  {
    "run_number": 25,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Fix React Native Exness SHA-256 compatibility"
  },
  {
    "run_number": 26,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(android): download and install latest GitHub release"
  },
  {
    "run_number": 27,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(android): let the system installer handle update confirmation"
  },
  {
    "run_number": 28,
    "conclusion": "success",
    "status": "completed",
    "display_title": "debug(exness): report safe timestamp diagnostics on auth errors"
  },
  {
    "run_number": 29,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(updater): parse numeric GitHub release tags correctly"
  },
  {
    "run_number": 30,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(updater): correct cached APK filename matching"
  },
  {
    "run_number": 31,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(updater): add uncached stable-release fallback lookup"
  },
  {
    "run_number": 32,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): sync timestamp after server window rejection"
  },
  {
    "run_number": 33,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): include request timing in safe diagnostics"
  },
  {
    "run_number": 34,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): estimate server clock offset at request midpoint"
  },
  {
    "run_number": 35,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): calibrate clock offset from response Date header"
  },
  {
    "run_number": 36,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(updater): use a public version manifest before GitHub API fallbacks"
  },
  {
    "run_number": 37,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "ci(updater): publish version manifest with every successful APK"
  },
  {
    "run_number": 38,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "chore(updater): add public update manifest for V35"
  },
  {
    "run_number": 39,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(ci): write valid JSON update manifest"
  },
  {
    "run_number": 40,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): separate account connection from optional balance lookup"
  },
  {
    "run_number": 41,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(app): connect to Exness without requiring account balance"
  },
  {
    "run_number": 42,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): correct account ID and gateway URL validation regex"
  },
  {
    "run_number": 43,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix nested Exness account balance parsing"
  },
  {
    "run_number": 44,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): robustly extract account balance"
  },
  {
    "run_number": 45,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): never treat account id as balance"
  },
  {
    "run_number": 46,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): read live balance from trading snapshot"
  },
  {
    "run_number": 47,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(exness): expose equity and used margin"
  },
  {
    "run_number": 48,
    "conclusion": "success",
    "status": "completed",
    "display_title": "feat(profile): show equity and used margin"
  },
  {
    "run_number": 49,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "feat(exness): add signed account state websocket stream"
  },
  {
    "run_number": 50,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "feat(profile): stream live Exness account state"
  },
  {
    "run_number": 51,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(exness): type signed websocket constructor"
  },
  {
    "run_number": 52,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): restore stream client and websocket typing"
  },
  {
    "run_number": 53,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(profile): configurable five-second auto refresh"
  },
  {
    "run_number": 54,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "feat(profile): color floating pnl and drag interval slider"
  },
  {
    "run_number": 55,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(profile): correct TextStyle typing and slider range labels"
  },
  {
    "run_number": 56,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(exness): correct websocket access point URL regex"
  },
  {
    "run_number": 57,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(ui): add interval refresh styles"
  },
  {
    "run_number": 58,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(ui): stabilize interval slider touch handling"
  },
  {
    "run_number": 59,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(ui): align slider thumb and progress track"
  },
  {
    "run_number": 60,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(ui): use measured slider width for touch tracking"
  },
  {
    "run_number": 61,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "docs(changelog): record interval slider fix"
  },
  {
    "run_number": 62,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(ui): remove invalid slider touch event property"
  },
  {
    "run_number": 63,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(sync): stop automatic updates when refresh clock is disabled"
  },
  {
    "run_number": 64,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "docs(changelog): record V63 synchronization controls"
  },
  {
    "run_number": 65,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(sync): pass explicit manual refresh flag to button"
  },
  {
    "run_number": 66,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(profile): stabilize interval slider and persist saved interval"
  },
  {
    "run_number": 67,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(profile): make last update follow selected refresh interval"
  },
  {
    "run_number": 68,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(history): add read-only Exness active and past history loader"
  },
  {
    "run_number": 69,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(history): add active and past trading history tab"
  },
  {
    "run_number": 70,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(history): add active and past trading history screen"
  },
  {
    "run_number": 71,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(history): consolidate history screen implementation"
  },
  {
    "run_number": 72,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(history): retain SLTP orders for active position details"
  },
  {
    "run_number": 73,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(history): hide SLTP helper orders from pending list"
  },
  {
    "run_number": 74,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): handle invalid time range timestamp errors"
  },
  {
    "run_number": 75,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): calibrate timestamp offset at request midpoint"
  },
  {
    "run_number": 76,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): robustly resync timestamp after invalid time range"
  },
  {
    "run_number": 77,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): calibrate clock from HTTP Date uncertainty interval"
  },
  {
    "run_number": 78,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): calibrate timestamp per response and retry rate limits"
  },
  {
    "run_number": 79,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(history): load active positions from Exness WebSocket snapshot"
  },
  {
    "run_number": 80,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(history): refresh active tab from WebSocket snapshot"
  },
  {
    "run_number": 81,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(history): switch data source with history mode"
  },
  {
    "run_number": 82,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(history): sign positions WebSocket with current device timestamp"
  },
  {
    "run_number": 83,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "feat(trading): add active order modification and close operations"
  },
  {
    "run_number": 84,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "feat(history): add floating PnL and trading action controls"
  },
  {
    "run_number": 85,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): hash mutation bodies without extra runtime dependency"
  },
  {
    "run_number": 86,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): correct SHA-256 compression for signed trading bodies"
  },
  {
    "run_number": 87,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(history): render trading confirmation dialogs"
  },
  {
    "run_number": 88,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(exness): keep signed header builder synchronous"
  },
  {
    "run_number": 89,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): send mutation idempotency key in signed headers"
  },
  {
    "run_number": 90,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(trading): validate order ids and Exness price payloads"
  },
  {
    "run_number": 91,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(profile): keep auto sync off after connect and stay on connection"
  },
  {
    "run_number": 92,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(history): show floating PnL for single active position"
  },
  {
    "run_number": 93,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(history): remove PnL from history tab"
  },
  {
    "run_number": 94,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(trading): send complete SLTP pair on modification"
  },
  {
    "run_number": 95,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "fix(history): remove remaining PnL helper"
  },
  {
    "run_number": 96,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(history): remove incomplete PnL helper and restore V95 typecheck"
  },
  {
    "run_number": 97,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(exness): write SHA-256 digest to output buffer for signed mutations"
  },
  {
    "run_number": 98,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(history): add pending entry editing and independent auto refresh"
  },
  {
    "run_number": 99,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "fix(history): guard automatic sync and dismiss menus on navigation"
  },
  {
    "run_number": 100,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(history): preserve selector toggle and reset stale account pair"
  },
  {
    "run_number": 101,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(android): add immersive fullscreen mode plugin"
  },
  {
    "run_number": 102,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "feat(android): enable immersive fullscreen system bars"
  },
  {
    "run_number": 103,
    "conclusion": "success",
    "status": "completed",
    "display_title": "fix(android): correctly inject immersive mode into MainActivity"
  },
  {
    "run_number": 104,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Fix Exness history timestamp calibration"
  },
  {
    "run_number": 105,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Show complete past history without pair selector"
  },
  {
    "run_number": 106,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Use direct timestamp for Exness history requests"
  },
  {
    "run_number": 107,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix history timestamp path and avoid rate-limit bursts"
  },
  {
    "run_number": 108,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix history range boundary and add endpoint diagnostics"
  },
  {
    "run_number": 109,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix history selector, manual sync and collapsible sections"
  },
  {
    "run_number": 110,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Support adding SLTP to positions without existing protection"
  },
  {
    "run_number": 111,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Allow configuring missing position SLTP values"
  },
  {
    "run_number": 112,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix malformed JSX in pending history section"
  },
  {
    "run_number": 113,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Fix Exness history time range using server clock"
  },
  {
    "run_number": 114,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Add show all and require pair selection in history"
  },
  {
    "run_number": 115,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Keep Exness history requests within server age limits"
  },
  {
    "run_number": 116,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Clear stale history errors when changing mode"
  },
  {
    "run_number": 117,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Reset server clock before each history query"
  },
  {
    "run_number": 118,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Improve balance and history details, interval sliders"
  },
  {
    "run_number": 119,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Include linked trading fees in history PNL"
  },
  {
    "run_number": 120,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Remove unused stream status display state"
  },
  {
    "run_number": 121,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Improve history grouping, shared sync, build status and swipe navigation"
  },
  {
    "run_number": 122,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Fetch active and past trading history in one sync"
  },
  {
    "run_number": 123,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Set Android launcher name to AI Assistant"
  },
  {
    "run_number": 124,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Polish swipe handling and history build status rendering"
  },
  {
    "run_number": 125,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix TypeScript typing for past order groups"
  },
  {
    "run_number": 126,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Restore complete build history cards and pagination"
  },
  {
    "run_number": 127,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix chronological build history sorting"
  },
  {
    "run_number": 128,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Add visual asset icons to open and pending trade pairs"
  },
  {
    "run_number": 129,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Add files via upload"
  },
  {
    "run_number": 130,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Fix pair asset labels and sort build history newest first"
  },
  {
    "run_number": 131,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Configure custom AI coding launcher icon"
  },
  {
    "run_number": 132,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add custom AI coding app launcher icon"
  },
  {
    "run_number": 133,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Replace corrupted launcher icon with valid PNG"
  },
  {
    "run_number": 134,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Use repository icon.png as Android app launcher icon"
  },
  {
    "run_number": 135,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add Exness positions trading screen with market and limit orders"
  },
  {
    "run_number": 136,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Use React Native signed WebSocket constructor for Exness ticks"
  },
  {
    "run_number": 137,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Fix positions screen TypeScript line break"
  },
  {
    "run_number": 138,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix Exness ticks WebSocket URL regex"
  },
  {
    "run_number": 139,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Fix positions UI, favorites, volume sliders and foreground reconnect"
  },
  {
    "run_number": 140,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Reconnect positions quote stream when app returns to foreground"
  },
  {
    "run_number": 141,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Add order tabs and Exness price validation"
  },
  {
    "run_number": 142,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Reconnect positions quote stream when app returns to foreground"
  },
  {
    "run_number": 143,
    "conclusion": "cancelled",
    "status": "completed",
    "display_title": "Add market limit tabs and Exness price validation"
  },
  {
    "run_number": 144,
    "conclusion": "failure",
    "status": "completed",
    "display_title": "Apply TP validation base price to active position pencil"
  },
  {
    "run_number": 145,
    "conclusion": "success",
    "status": "completed",
    "display_title": "Fix active position validation typecheck"
  }
];
