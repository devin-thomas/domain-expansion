#!/usr/bin/env bash
set -euo pipefail

if ! command -v flutter >/dev/null 2>&1; then
  echo "Flutter is required: https://docs.flutter.dev/get-started/install" >&2
  exit 1
fi

# Generate the standard Android/iOS host projects around the supplied Dart source.
flutter create --platforms=android,ios --org com.devinthomas --project-name domain_expansion .
flutter pub get
flutter analyze
flutter test
