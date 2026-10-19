#!/usr/bin/env bash
# Monta el vídeo de la partida a dos a partir de scripts/record-duo.cjs.
# Cada tramo es una secuencia continua de fotogramas reales a 30 fps (velocidad real) con su sonido.
# Salida: shots/video-duo/mudanza-imposible-dos-jugadores.mp4 (H.264 + AAC).
set -euo pipefail
cd "$(dirname "$0")/../shots/video-duo"
rm -rf parts && mkdir parts
enc=(-c:v libx264 -preset slow -crf 25 -profile:v high -level 4.0 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -ar 44100 -ac 2)

ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 30 -t 3 -i titulo.png -f lavfi -t 3 -i anullsrc=r=44100:cl=stereo \
  -vf "fade=out:st=2.7:d=0.3" "${enc[@]}" -shortest parts/00.mp4

i=1
for d in $(ls -d [0-9]*/ | tr -d / | sort -n); do
  frames=$(ls "$d" | wc -l)
  [ "$frames" -gt 0 ] || continue
  dur=$(python3 -c "print($frames/30)")
  label=$(python3 -c "import json;print(json.load(open('tramos.json'))['segs'][$d]['label'])")
  if [ "$d" = 0 ]; then chip=chip-teclado.png; secs=5; elif [ "$d" = 1 ]; then chip=chip-piloto.png; secs=4; else chip=chip-corte.png; secs=2; fi
  ffmpeg -hide_banner -loglevel error -y -framerate 30 -i "$d/%05d.jpg" -i "$d.wav" -loop 1 -framerate 30 -t "$dur" -i "$chip" -frames:v "$frames" \
    -filter_complex "[2]format=rgba,fade=out:st=$((secs - 1)):d=0.5:alpha=1[c];[0][c]overlay=0:0:enable='lt(t,$secs)',fade=in:st=0:d=0.15[v]" \
    -map "[v]" -map 1:a "${enc[@]}" -af "volume=2,apad,afade=in:d=0.1" -t "$dur" "parts/$(printf %02d $i).mp4"
  echo "tramo $d ($label): $frames fotogramas"
  i=$((i + 1))
done

(cd parts && ls *.mp4 | sed "s/^/file '/; s/$/'/") > parts/list.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i parts/list.txt -c copy -movflags +faststart mudanza-imposible-dos-jugadores.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,profile -of compact mudanza-imposible-dos-jugadores.mp4
