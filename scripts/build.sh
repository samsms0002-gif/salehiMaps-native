#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [ -d /opt/dotnet ]; then
  export DOTNET_ROOT=/opt/dotnet
  export PATH="/opt/dotnet:$PATH"
fi

dotnet --version

# Tests and the Windows-like desktop build do not need the Android workload.
dotnet test src/salehiMaps.Tests/salehiMaps.Tests.csproj -c Release
dotnet publish src/salehiMaps.Desktop/salehiMaps.Desktop.csproj -c Release -r win-x64 --self-contained true -o publish/desktop-win-x64

# Android requires the workload and Android SDK.
if [ "${BUILD_ANDROID:-1}" = "1" ]; then
  if [ -z "${ANDROID_HOME:-}" ] && [ -d /opt/android-sdk ]; then
    export ANDROID_HOME=/opt/android-sdk
  fi
  if [ -n "${ANDROID_HOME:-}" ]; then
    export ANDROID_SDK_ROOT="$ANDROID_HOME"
  fi
  dotnet workload install android
  dotnet publish src/salehiMaps.Android/salehiMaps.Android.csproj -c Release -f net8.0-android -o publish/android
fi
