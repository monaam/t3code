#!/bin/bash
# Updates the "T3 CEO" fork build to the newest upstream T3 Code release:
# merge the release tag into feat/ceo-mode, check, build the dmg, install it.
# Re-run after any stop; it resumes where it left off.
#
#   scripts/ceo-update.sh            update to the newest stable upstream tag
#   scripts/ceo-update.sh --check    report what would happen, change nothing
#   scripts/ceo-update.sh --tag v0.1.10
#   scripts/ceo-update.sh --force    rebuild and reinstall even if up to date
#
# Each question is asked on the terminal. Without one, the run stops at the
# question unless its answer was given up front:
#   --accept-migrations  --commit  --push  --quit-app
set -euo pipefail

BRANCH="feat/ceo-mode"
UPSTREAM="upstream"
NODE_VERSION="26.12.1"
APP="/Applications/T3 CEO.app"
# The fork was installed under this name before the T3 CEO rename.
LEGACY_APP="/Applications/T3 Code CEO.app"
FALLBACK_APP="/Applications/T3 Code (Beta).app"
LIVE_DB="$HOME/.t3/userdata/statev2.sqlite"
LIVE_SETTINGS="$HOME/.t3/userdata/client-settings.json"
MIGRATIONS_FILE="apps/server/src/persistence/Migrations.ts"
FORK_MARKER="Nothing needs you right now"
GREP=/usr/bin/grep

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
INSTALLED_FILE="$ROOT/release/ceo-installed-commit"

TAG=""
CHECK_ONLY=0
FORCE=0
PRE_MIGRATIONS=0
PRE_COMMIT=0
PRE_PUSH=0
PRE_QUIT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --check) CHECK_ONLY=1 ;;
    --force) FORCE=1 ;;
    --tag) TAG="${2:?--tag needs a value}"; shift ;;
    --accept-migrations) PRE_MIGRATIONS=1 ;;
    --commit) PRE_COMMIT=1 ;;
    --push) PRE_PUSH=1 ;;
    --quit-app) PRE_QUIT=1 ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done

step() { printf '\n==> %s\n' "$*"; }
stop() { printf '\nSTOPPED: %s\n' "$*" >&2; exit 1; }

# confirm <pre-answered 0|1> <flag name> <question>: 0 = yes, 1 = no.
confirm() {
  if [ "$1" = 1 ]; then echo "$3 yes ($2)"; return 0; fi
  if ! { : </dev/tty; } 2>/dev/null; then
    stop "Needs an answer: $3 Re-run in a terminal, or pass $2 once Monaam has agreed."
  fi
  local answer
  read -r -p "$3 [y/N] " answer </dev/tty
  [ "$answer" = y ] || [ "$answer" = Y ]
}

tag_migration_head() {
  git show "$1:$MIGRATIONS_FILE" 2>/dev/null |
    sed -nE 's/^[[:space:]]*\[([0-9]+), ".*/\1/p' | sort -n | tail -1
}

app_pids() { pgrep -f "$1/Contents/" || true; }

# ---------------------------------------------------------------- preflight

[ "$(uname -sm)" = "Darwin arm64" ] || stop "This script builds and installs the macOS arm64 app only."
[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || stop "Check out $BRANCH first."

MERGING=0
if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
  MERGING=1
  UNMERGED="$(git diff --name-only --diff-filter=U)"
  if [ -n "$UNMERGED" ]; then
    stop "The merge still has conflicts in:
$UNMERGED
Resolve them, 'git add' the files, then re-run. To give up: git merge --abort"
  fi
  MERGE_TAG="$(git describe --tags --exact-match MERGE_HEAD 2>/dev/null || true)"
  [ -n "$MERGE_TAG" ] || stop "A merge is in progress that is not a release tag. Finish or abort it first."
  if [ -n "$TAG" ] && [ "$TAG" != "$MERGE_TAG" ]; then
    stop "A merge of $MERGE_TAG is in progress, not $TAG. Finish or abort it first."
  fi
  TAG="$MERGE_TAG"
elif [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  stop "The working tree has uncommitted changes. Commit or stash them first."
fi

# ----------------------------------------------------------- find the release

if [ "$MERGING" = 0 ]; then
  step "Looking for the newest upstream release"
  if [ -z "$TAG" ]; then
    TAG="$(git ls-remote --tags --refs "$UPSTREAM" 'v*' | awk '{print $2}' |
      sed -nE 's#^refs/tags/(v[0-9]+\.[0-9]+\.[0-9]+)$#\1#p' | sort -V | tail -1)"
    [ -n "$TAG" ] || stop "Found no stable vX.Y.Z tag on $UPSTREAM."
  fi
  git fetch --quiet --no-tags "$UPSTREAM" "refs/tags/$TAG:refs/tags/$TAG" ||
    stop "Could not fetch tag $TAG from $UPSTREAM."
fi
echo "Release: $TAG"

ALREADY_MERGED=0
if [ "$MERGING" = 0 ] && git merge-base --is-ancestor "$TAG" HEAD; then ALREADY_MERGED=1; fi

INSTALLED=""
[ -f "$INSTALLED_FILE" ] && INSTALLED="$(cat "$INSTALLED_FILE")"

# ------------------------------------------------------------ migration gate

TAG_LEVEL="$(tag_migration_head "$TAG")"
[ -n "$TAG_LEVEL" ] || stop "Could not read the migration level of $TAG from $MIGRATIONS_FILE. The file may have moved; check before updating."
DB_LEVEL=""
if [ -f "$LIVE_DB" ]; then
  DB_LEVEL="$(sqlite3 -readonly "$LIVE_DB" "select max(migration_id) from effect_sql_migrations")" ||
    stop "Could not read the migration level of $LIVE_DB."
fi
echo "Migrations: $TAG is at $TAG_LEVEL, your data is at ${DB_LEVEL:-none}."

if [ -n "$DB_LEVEL" ] && [ "$TAG_LEVEL" -lt "$DB_LEVEL" ]; then
  stop "$TAG knows migrations up to $TAG_LEVEL but your data is already at $DB_LEVEL. An app built from it would refuse your data."
fi
ADDS_MIGRATIONS=0
if [ -n "$DB_LEVEL" ] && [ "$TAG_LEVEL" -gt "$DB_LEVEL" ]; then ADDS_MIGRATIONS=1; fi

if [ "$CHECK_ONLY" = 1 ]; then
  step "Report only"
  if [ "$MERGING" = 1 ]; then echo "A merge of $TAG is in progress with no conflicts left. A run would continue at the checks."
  elif [ "$ALREADY_MERGED" = 0 ]; then echo "$TAG is not merged into $BRANCH yet. A run would merge, check, build and install it."
  elif [ "$INSTALLED" = "$(git rev-parse HEAD)" ]; then echo "$TAG is merged and this commit is installed. Nothing to do."
  else echo "$TAG is merged, but the installed app was not recorded as built from this commit. A run would build and install."
  fi
  [ "$ADDS_MIGRATIONS" = 1 ] && echo "Installing it migrates your data from $DB_LEVEL to $TAG_LEVEL. The official Beta app stops working until it is updated to $TAG too."
  exit 0
fi

if [ "$ALREADY_MERGED" = 1 ] && [ "$INSTALLED" = "$(git rev-parse HEAD)" ] && [ "$FORCE" = 0 ]; then
  echo "$TAG is merged and this commit is installed. Nothing to do (--force rebuilds)."
  exit 0
fi

if [ "$ADDS_MIGRATIONS" = 1 ]; then
  confirm "$PRE_MIGRATIONS" --accept-migrations \
    "Installing $TAG migrates your data from $DB_LEVEL to $TAG_LEVEL. After that the official Beta app stops working until it is updated to $TAG too. Go ahead?" ||
    stop "Not updating."
fi

# ------------------------------------------------------------------ toolchain

step "Switching to Node $NODE_VERSION"
if [ "$(node --version 2>/dev/null)" != "v$NODE_VERSION" ]; then
  [ -s "$HOME/.nvm/nvm.sh" ] || stop "Node $NODE_VERSION is needed and nvm was not found."
  set +eu
  # shellcheck disable=SC1091
  . "$HOME/.nvm/nvm.sh"
  nvm use "$NODE_VERSION" >/dev/null
  NVM_STATUS=$?
  set -eu
  [ "$NVM_STATUS" = 0 ] || stop "nvm could not switch to Node $NODE_VERSION (nvm install $NODE_VERSION)."
fi
command -v vp >/dev/null || stop "'vp' is not on PATH under Node $NODE_VERSION."

# ---------------------------------------------------------------------- merge

if [ "$ALREADY_MERGED" = 0 ]; then
  if [ "$MERGING" = 0 ]; then
    step "Merging $TAG into $BRANCH"
    if ! git merge --no-ff --no-commit "$TAG"; then
      UNMERGED="$(git diff --name-only --diff-filter=U)"
      stop "The merge has conflicts in:
$UNMERGED
Resolve them, 'git add' the files, then re-run. To give up: git merge --abort"
    fi
  fi

  step "Installing dependencies"
  vp i || stop "'vp i' failed. The merge is left uncommitted; fix and re-run."

  step "Running checks on the fork's changes"
  vp run check:changed "$TAG" ||
    stop "Checks failed. The merge is left uncommitted. For format failures run 'vp fmt' on the listed files, then re-run."

  confirm "$PRE_COMMIT" --commit "Checks passed. Commit the merge of $TAG?" ||
    stop "Merge left uncommitted. Re-run to continue, or 'git merge --abort' to drop it."
  git add -u
  git commit -m "chore: merge upstream $TAG into CEO mode" ||
    stop "The commit was rejected (see above). Fix and re-run."

  if confirm "$PRE_PUSH" --push "Push $BRANCH to origin?"; then
    git push origin "$BRANCH" || echo "Push failed; continuing with the build. Push later by hand."
  fi
fi

# ---------------------------------------------------------------------- build

step "Building the desktop app (this takes a while)"
BUILD_STAMP="$(mktemp)"
T3CODE_DESKTOP_VERSION="${TAG#v}" vp run dist:desktop:dmg:arm64 ||
  stop "The build failed. If browser tests could not start: vp exec playwright install chromium-headless-shell"
DMG="$(find "$ROOT/release" -maxdepth 1 -name 'T3-*-arm64.dmg' -newer "$BUILD_STAMP" | head -1)"
rm -f "$BUILD_STAMP"
[ -n "$DMG" ] || stop "The build finished but wrote no new dmg in release/."
echo "Built: $DMG"

# -------------------------------------------------------------------- install

step "Installing over $APP"
[ -z "$(app_pids "$FALLBACK_APP")" ] ||
  stop "The official T3 Code (Beta) app is running. Quit it, then re-run with --force. The build is at $DMG"
[ -z "$(app_pids "$LEGACY_APP")" ] ||
  stop "T3 Code CEO (the old name) is running. Quit it, then re-run with --force. The build is at $DMG"

MOUNT="$(mktemp -d)"
detach() { hdiutil detach -quiet "$MOUNT" 2>/dev/null || true; rmdir "$MOUNT" 2>/dev/null || true; }
trap detach EXIT
hdiutil attach -quiet -nobrowse -readonly -mountpoint "$MOUNT" "$DMG" || stop "Could not mount $DMG."
NEW_APP="$(find "$MOUNT" -maxdepth 1 -name '*.app' | head -1)"
ASAR="$NEW_APP/Contents/Resources/app.asar"
[ -n "$NEW_APP" ] && [ -f "$ASAR" ] || stop "No app found inside $DMG. Nothing was changed."
LC_ALL=C $GREP -q "$FORK_MARKER" "$ASAR" ||
  stop "The built app does not contain the CEO mode code. Nothing was changed."

if [ -n "$(app_pids "$APP")" ]; then
  if [ -f "$LIVE_DB" ]; then
    RECENT="$(sqlite3 -readonly "$LIVE_DB" "select updated_at || '  ' || title from orchestration_v2_projection_threads where updated_at > strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 minutes') order by updated_at desc" || true)"
    if [ -n "$RECENT" ]; then
      echo "Threads active in the last 5 minutes (they may be mid-run):"
      echo "$RECENT"
    else
      echo "No thread was active in the last 5 minutes."
    fi
  fi
  confirm "$PRE_QUIT" --quit-app "Quit T3 CEO now and install $TAG?" ||
    stop "Not installed. Re-run with --force when ready. The build is at $DMG"
  osascript -e 'tell application "T3 CEO" to quit' || true
  WAITED=0
  while [ -n "$(app_pids "$APP")" ]; do
    [ "$WAITED" -lt 60 ] || stop "T3 CEO did not quit within 60 seconds. Quit it by hand, then re-run with --force."
    sleep 1
    WAITED=$((WAITED + 1))
  done
fi

PREVIOUS="$ROOT/release/previous"
rm -rf "$APP.new"
ditto "$NEW_APP" "$APP.new" || stop "Could not copy the new app. The installed app is untouched."
if [ -d "$APP" ]; then
  rm -rf "$PREVIOUS"
  mkdir -p "$PREVIOUS"
  mv "$APP" "$PREVIOUS/" || stop "Could not move the old app aside. The new one is at $APP.new"
fi
mv "$APP.new" "$APP"
if [ -d "$LEGACY_APP" ]; then
  mkdir -p "$PREVIOUS"
  rm -rf "$PREVIOUS/$(basename "$LEGACY_APP")"
  mv "$LEGACY_APP" "$PREVIOUS/" || echo "Could not move $LEGACY_APP aside. Delete it by hand."
fi
xattr -dr com.apple.quarantine "$APP" 2>/dev/null || true
git rev-parse HEAD >"$INSTALLED_FILE"
detach
trap - EXIT

# --------------------------------------------------------------------- verify

step "Starting and verifying"
open "$APP"
WAITED=0
while [ -z "$(app_pids "$APP")" ]; do
  [ "$WAITED" -lt 30 ] || stop "The new app did not start. The previous one is kept at $PREVIOUS"
  sleep 1
  WAITED=$((WAITED + 1))
done
if [ -f "$LIVE_SETTINGS" ] && ! $GREP -Eq '"ceoModeEnabled":[[:space:]]*true' "$LIVE_SETTINGS"; then
  echo "WARNING: ceoModeEnabled is not true in $LIVE_SETTINGS. Turn CEO mode back on in Settings."
fi
echo
echo "Done. T3 CEO is running $TAG ($(git rev-parse --short HEAD))."
echo "The previous app is kept at $PREVIOUS"
