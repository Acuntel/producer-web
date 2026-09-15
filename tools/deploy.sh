#!/bin/zsh
# Production deploy. The Vercel CLI's archive picks up data/dna even though .vercelignore lists it (a 5.5 GB
# upload with the AcousticBrainz dumps in place), so the raw store steps out of the tree for the archive step
# and comes straight back: the archive is built before the upload starts.
set -e
cd "$(dirname "$0")/.."
# data/dna (offline parquet, the raw dumps) and tests/fixtures (spoken WAVs) are never read by the deployed app.
ASIDE=../producer-web.deploy-aside; mkdir -p $ASIDE
[ -d data/dna ] && mv data/dna $ASIDE/dna
[ -d tests/fixtures ] && mv tests/fixtures $ASIDE/fixtures
restore() { [ -d $ASIDE/dna ] && mv $ASIDE/dna data/dna; [ -d $ASIDE/fixtures ] && mv $ASIDE/fixtures tests/fixtures; rmdir $ASIDE 2>/dev/null; }
trap restore EXIT
npx vercel --prod --yes --archive=tgz "$@"
