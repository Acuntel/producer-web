#!/bin/zsh
# Production deploy. The Vercel CLI's archive picks up data/dna even though .vercelignore lists it (a 5.5 GB
# upload with the AcousticBrainz dumps in place), so the raw store steps out of the tree for the archive step
# and comes straight back: the archive is built before the upload starts.
set -e
cd "$(dirname "$0")/.."
RAW=data/dna/raw; ASIDE=../producer-data-raw.deploy
[ -d $RAW ] && mv $RAW $ASIDE
trap '[ -d $ASIDE ] && mv $ASIDE $RAW' EXIT
npx vercel --prod --yes --archive=tgz "$@"
