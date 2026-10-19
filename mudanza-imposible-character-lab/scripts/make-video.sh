#!/usr/bin/env bash
# Monta shots/video/laboratorio-personaje.mp4 (H.264, 720p, 30 fps, sin sonido: el laboratorio no tiene audio)
# a partir de los fotogramas de scripts/record-video.cjs. Cada tramo va a velocidad real; solo hay cortes entre pruebas.
set -euo pipefail
cd "$(dirname "$0")/../shots/video"
rm -rf parts && mkdir parts
enc=(-c:v libx264 -preset slow -crf 23 -profile:v high -level 4.0 -pix_fmt yuv420p -r 30)
ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 30 -t 2.2 -i titulo.png -vf "fade=out:st=1.9:d=0.3" "${enc[@]}" parts/0.mp4
i=1
for t in A B C D; do
  ffmpeg -hide_banner -loglevel error -y -framerate 30 -i "$t/%05d.jpg" -vf "fade=in:st=0:d=0.15" "${enc[@]}" "parts/$i.mp4"
  i=$((i + 1))
done
(cd parts && ls *.mp4 | sort -n | sed "s/^/file '/; s/$/'/") > parts/list.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i parts/list.txt -c copy -movflags +faststart laboratorio-personaje.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,profile -of compact laboratorio-personaje.mp4
