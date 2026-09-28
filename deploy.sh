#!/usr/bin/env bash
# Local entry point. GitHub Actions builds the production image and invokes
# deploy/deploy.sh on Hetzner; credentials stay in GitHub Actions.
set -euo pipefail

usage() {
  cat <<'HELP'
Usage: ./deploy.sh [--check]

Deploy the current, pushed main commit through GitHub Actions.
--check verifies readiness without starting a deployment.

Requires git and an authenticated GitHub CLI (gh auth login).
Commit and push changes first, then wait for CI to pass. A successful push
normally deploys automatically; use this script to redeploy the same commit.
HELP
}
fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
case "${1:-}" in
  --help|-h) usage; exit 0 ;;
  --check|'') ;;
  *) usage >&2; exit 2 ;;
esac
[ "$#" -le 1 ] || { usage >&2; exit 2; }
for tool in git gh; do
  command -v "$tool" >/dev/null || fail "$tool is required"
done
cd "$(dirname "${BASH_SOURCE[0]}")"
git rev-parse --show-toplevel >/dev/null
gh auth status >/dev/null 2>&1 || fail 'Run gh auth login first.'
[ "$(git branch --show-current)" = main ] || fail 'Switch to main first.'
[ -z "$(git status --porcelain)" ] || fail 'Commit or stash local changes first. Nothing was deployed.'
git fetch origin main --quiet
sha=$(git rev-parse HEAD)
[ "$sha" = "$(git rev-parse origin/main)" ] || fail 'Local main must match origin/main. Pull or push first.'

ci=$(gh run list --workflow ci.yml --branch main --commit "$sha" --event push --limit 1 \
  --json status,conclusion --jq '.[0] | .status + ":" + .conclusion')
[ "$ci" = completed:success ] || fail "CI for $sha has not passed ($ci). Check gh run list."
active=$(gh run list --workflow deploy.yml --branch main --limit 100 \
  --json status --jq '[.[] | select(.status != "completed")] | length')
[ "$active" = 0 ] || fail 'A deployment is already pending or running. Check gh run list --workflow deploy.yml.'

printf 'Ready to deploy %s\n' "$sha"
[ "${1:-}" != --check ] || exit 0
# Recheck the remote branch immediately before dispatching. Workflow dispatch
# accepts a branch or tag; do not create a release tag as a side effect.
remote_sha=$(git ls-remote origin refs/heads/main | cut -f1)
[ "$remote_sha" = "$sha" ] || fail 'Remote main changed during checks. Run again.'
gh workflow run deploy.yml --ref main
printf 'Deployment requested. Follow progress with:\n  gh run list --workflow deploy.yml\n'
