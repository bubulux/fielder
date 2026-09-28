#!/usr/bin/env bash
# Build the APK locally (EAS --local, same keystore) and copy it to the Windows Downloads folder.
# WSL only. Toolchain as in docs/development.md (JDK 17 in ~/tools, Android SDK in ~/Android/Sdk).
# Overrides: API_URL (the Worker the app talks to), DOWNLOADS (target folder).
set -euo pipefail
cd "$(dirname "$0")/.."

JAVA_HOME=$(ls -d ~/tools/jdk-17* 2>/dev/null | head -1 || true)
[ -n "$JAVA_HOME" ] || { echo "No JDK 17 in ~/tools (see docs/development.md)" >&2; exit 1; }
export JAVA_HOME ANDROID_HOME=~/Android/Sdk ANDROID_SDK_ROOT=~/Android/Sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/cmake/3.22.1/bin:$PATH
export EXPO_PUBLIC_API_URL=${API_URL:-https://fielder-api.fielder-worker.workers.dev}

# The Windows user's Downloads, as a WSL path (cmd.exe complains about the UNC cwd; hence /mnt/c).
if [ -z "${DOWNLOADS:-}" ]; then
  win_home=$(cd /mnt/c && cmd.exe /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')
  [ -n "$win_home" ] || { echo "Could not find the Windows user folder; set DOWNLOADS=/mnt/c/Users/<you>/Downloads" >&2; exit 1; }
  DOWNLOADS="$(wslpath "$win_home")/Downloads"
fi
[ -d "$DOWNLOADS" ] || { echo "No folder $DOWNLOADS; set DOWNLOADS=…" >&2; exit 1; }

commit=$(git rev-parse --short HEAD)
[ -z "$(git status --porcelain)" ] || echo "Note: uncommitted changes are built, but the file is named after $commit."
pnpm -C apps/mobile build:apk:local   # writes ~/fielder-builds/fielder-<commit>.apk

apk=~/fielder-builds/fielder-$commit.apk
cp "$apk" "$DOWNLOADS/"
echo "APK: $DOWNLOADS/fielder-$commit.apk"
