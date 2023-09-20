#!/bin/sh

prefix="$1"

cargo run -r -- --host http://localhost:3080 --report-file="${prefix}_indexhtml.html" --no-reset-metrics --hatch-rate 5 --run-time 20s --scenarios indexhtml
cargo run -r -- --host http://localhost:3080 --report-file="${prefix}_indexgraphql.html" --no-reset-metrics --hatch-rate 5 --run-time 20s --scenarios indexgraphql
cargo run -r -- --host http://localhost:3080 --report-file="${prefix}_videographql.html" --no-reset-metrics --hatch-rate 5 --run-time 20s --scenarios videographql
