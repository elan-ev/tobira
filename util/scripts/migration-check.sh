#!/bin/sh

target="main"
git tag --sort=-creatordate | grep '^v[0-9]\.[0-9]*$' | while IFS= read -r tag; do
    if git diff $tag $target --name-only | grep -q 'src/db/migrations/.*\.sql$'; then
        echo "$target \t-> NEW MIGRATIONS"
    else
        echo "$target \t-> no new migrations"
    fi
    target="$tag"
done
