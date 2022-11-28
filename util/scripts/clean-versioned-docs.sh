#!/bin/bash

basedir=$(dirname "$0")
cd "$basedir/../../docs" || exit 1

rm -rf versioned_docs versioned_sidebars
rm -f versions.json
