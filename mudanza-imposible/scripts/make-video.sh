#!/usr/bin/env bash
# Monta el vídeo a partir de las tomas grabadas con scripts/record.cjs y los rótulos de scripts/video-cards.cjs.
# Cada tramo es una secuencia continua de fotogramas reales a 30 fps (velocidad real); entre tramos solo se
# cortan tiempos muertos. Salida: shots/video/mudanza-imposible-partida-real.mp4 (H.264 + AAC, apto para Android).
set -euo pipefail
cd "$(dirname "$0")/../shots/video"
rm -rf parts && mkdir parts
enc=(-c:v libx264 -preset slow -crf 25 -profile:v high -level 4.0 -pix_fmt yuv420p -r 30 -c:a aac -b:a 128k -ar 44100 -ac 2)

# Título (2,5 s, sin sonido)
ffmpeg -hide_banner -loglevel error -y -loop 1 -framerate 30 -t 2.5 -i titulo.png -f lavfi -t 2.5 -i anullsrc=r=44100:cl=stereo \
  -vf "fade=out:st=2.2:d=0.3" "${enc[@]}" -shortest parts/00.mp4

# tramo <n> <toma> <primer fotograma> <último fotograma> [rótulo] [segundos de rótulo]
tramo() {
  local n=$1 take=$2 a=$3 b=$4 chip=${5:-} secs=${6:-0}
  local frames=$((b - a)) ss
  ss=$(python3 -c "print($a/30)")
  local dur
  dur=$(python3 -c "print($frames/30)")
  local vf="fade=in:st=0:d=0.2"
  local inputs=(-framerate 30 -start_number "$a" -i "$take/%05d.jpg" -ss "$ss" -t "$dur" -i "$take.wav")
  if [ -n "$chip" ]; then
    inputs+=(-loop 1 -framerate 30 -t "$dur" -i "$chip")
    ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -frames:v "$frames" \
      -filter_complex "[2]format=rgba,fade=out:st=$((secs - 1)):d=0.5:alpha=1[c];[0][c]overlay=0:0:enable='lt(t,$secs)',$vf[v]" \
      -map "[v]" -map 1:a "${enc[@]}" -af "volume=2,apad,afade=in:d=0.1" -t "$dur" "parts/$n.mp4"
  else
    ffmpeg -hide_banner -loglevel error -y "${inputs[@]}" -frames:v "$frames" -vf "$vf" \
      -map 0:v -map 1:a "${enc[@]}" -af "volume=2,apad,afade=in:d=0.1" -t "$dur" "parts/$n.mp4"
  fi
}

# Toma 1: J1 con teclado agarra y cruza en rojo; el coche se lleva al grupo por delante
tramo 01 A-teclado 20 230 chip-teclado.png 4
# Toma 2: piloto automático. Recoger el sofá…
tramo 02 B-auto 0 105 chip-auto.png 4
# …(se corta la espera en la acera) se abre el semáforo, cruce y puerta…
tramo 03 B-auto 235 456
# …portal, pasillo, escalera y giro en el rellano…
tramo 04 B-auto 456 760
# …(se corta el pasillo de arriba) terraza, rampa de chapa, entrega y resultado
tramo 05 B-auto 880 1175

(cd parts && ls *.mp4 | sed "s/^/file '/; s/$/'/") > parts/list.txt
ffmpeg -hide_banner -loglevel error -y -f concat -safe 0 -i parts/list.txt -c copy -movflags +faststart mudanza-imposible-partida-real.mp4
ffprobe -v error -show_entries format=duration,size:stream=codec_name,width,height,r_frame_rate,profile -of compact mudanza-imposible-partida-real.mp4
