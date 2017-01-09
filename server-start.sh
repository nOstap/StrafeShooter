#!/bin/bash
#
set -ue
[ ! -d 'node_modules' ] && npm install socket.io express
set -x

node server/server $*
