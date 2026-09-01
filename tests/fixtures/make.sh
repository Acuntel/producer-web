#!/bin/zsh
# Regenerate the real-track fixtures: raw float32 mono 22050 Hz, first 150 s.
# Ground truth is in the source filenames: "BPM CAMELOT - Artist - Title.mp3".
set -e
SRC=$(ls -d "$HOME/Desktop/Good Music From Slop"* | head -1)  # the folder name carries a trailing space
OUT="$(cd "$(dirname "$0")" && pwd)"
FF=/opt/homebrew/bin/ffmpeg
conv() { # conv <output-basename> <dir> <name glob>
  local name="$1" dir="$2" pat="$3" f
  f=$(find "$dir" -maxdepth 1 -name "$pat" | head -1)
  if [ -z "$f" ]; then echo "MISSING: $pat"; return; fi
  echo "-> $name  ($(basename "$f"))"
  "$FF" -y -loglevel error -i "$f" -t 150 -ac 1 -ar 22050 -f f32le "$OUT/$name.f32"
}
conv sacrifice_125_10A     "$SRC" "125 10A - The Weeknd - Sacrifice*"
conv losingit_125_6A       "$SRC" "125 6A - Fisher - Losing It*"
conv lovetonight_126_5A    "$SRC" "126 5A - Shouse - Love Tonight*"
conv takeitoff_127_2A      "$SRC" "127 2A - TAKEITOFFbyFISHER*"
conv imgood_128_6A         "$SRC" "128 6A - David Guetta*"
conv vamos_128_12A         "$SRC" "128 12A - Willem De Roo*"
conv pumpupthejam_125_8B   "$SRC" "125 8B - Technotronic*"
conv pursuit_128_8A        "$SRC" "128 8A - Kid Cudi*"
conv bloodymary_128_9A     "$SRC" "128 9A - Lady Gaga*"
conv shiver_127_9A         "$SRC" "127 9A - John Summit*"
conv worldholdon_127_2A    "$SRC" "127 2A - BobSinclar*"
conv skyfullofstars_125_2B "$SRC" "125 2B - Coldplay*"
# Unasserted octave-ambiguity checks (tagged 172, likely half-time feel):
conv anyma_ext_172_2A      "$SRC" "Anyma - Beautiful*Extended*"
conv anyma_remix_172_2A    "$HOME/Downloads/Anyma - Beautiful (with Joji) Cegor Remixes" "Anyma - Beautiful*Remix)*"
echo done
