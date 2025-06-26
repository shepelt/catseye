#!/bin/sh

if [[ $# -eq 0 ]] ; then
    echo 'no capture stream source given'
    exit 0
fi

mkdir -p ../temp
rm -rf ../temp/snapshot.jpg
ffmpeg -rtsp_transport tcp -i $1 -vf "fps=1,scale=640:-1" -update 1 ../temp/snapshot.jpg
