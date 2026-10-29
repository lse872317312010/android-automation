#!/usr/bin/env bash
# Stage, download and verify all bytes before exposing a milestone Release.
set -euo pipefail
milestone_artifacts="${1:?milestone directory required}"
milestone_source="${2:?source bundle required}"
: "${GITHUB_SHA:?}" "${GITHUB_REPOSITORY:?}" "${RELEASE_TAG:?}"
if [ "$RELEASE_TAG" != "milestone-$GITHUB_SHA" ]; then
  printf '%s\n' 'RELEASE_IDENTITY_MISMATCH' >&2
  exit 1
fi
milestone_tools="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
python3 "$milestone_tools/verify-milestone.py" --directory "$milestone_artifacts" \
  --commit "$GITHUB_SHA" --source-bundle "$milestone_source"
if milestone_draft="$(gh release view "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --json isDraft --jq .isDraft)"; then
  case "$milestone_draft" in
    true) gh release upload "$RELEASE_TAG" "$milestone_artifacts"/* --repo "$GITHUB_REPOSITORY" --clobber ;;
    false) ;; # Published bytes are never replaced.
    *) exit 1 ;;
  esac
else
  gh release create "$RELEASE_TAG" "$milestone_artifacts"/* \
    --repo "$GITHUB_REPOSITORY" --target "$GITHUB_SHA" --draft --prerelease \
    --title "Android Automation milestone ${GITHUB_SHA:0:12}" \
    --notes "CI-tested milestone APK for commit $GITHUB_SHA. Verify SHA256SUMS. Debug signature; reinstall may be required for later milestones. This is not Redmi or live-game verified."
  milestone_draft=true
fi
milestone_download_dir="$(mktemp -d)"
trap 'rm -rf -- "$milestone_download_dir"' EXIT
gh release download "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --dir "$milestone_download_dir"
python3 "$milestone_tools/verify-milestone.py" --directory "$milestone_download_dir" --commit "$GITHUB_SHA" \
  --source-bundle "$milestone_source" --expected-checksums "$milestone_artifacts/SHA256SUMS"
if [ "$milestone_draft" = true ]; then
  gh release edit "$RELEASE_TAG" --repo "$GITHUB_REPOSITORY" --draft=false
fi
