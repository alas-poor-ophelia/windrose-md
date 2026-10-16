#!/bin/sh
# usage: final-run.sh <name> <eval> [extra run.ts args...]  (out -> out-final/<name>)
H=/c/Dev/windrose/.wt/weather-wadjet/spikes/weather-harness
N=$1; E=$2; shift 2
mkdir -p $H/out-final/$N
cat $H/evals/final/common.js $H/evals/final/$E > $H/out-final/$N/combined-eval.js
cd $H && node --experimental-strip-types --no-warnings run.ts --windrose C:/Dev/windrose/.wt/weather-wadjet --wadjet "${WADJET_SRC:-C:/Dev/U+13080/.wt/integration-api}" --vault C:/Dev/scratch-vaults/weather-final --out $H/out-final/$N --eval $H/out-final/$N/combined-eval.js "$@" > $H/out-final/$N/run.log 2>&1
echo "exit=$?"
grep -E "pageerror|console.error|FAILED|shot ->" $H/out-final/$N/run.log | head -20
cat $H/out-final/$N/eval-result.json 2>/dev/null | head -150
