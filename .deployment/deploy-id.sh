#!/bin/bash

# Reads the GITHUB_REF env variable and prints an ID that can be used as
# subdomain and identifier.

if [[ $GITHUB_REF == refs/pull/* ]]; then
    tmp="${GITHUB_REF#refs/pull/}"
    echo "pr${tmp%/merge}"
else
    branch="${GITHUB_REF#refs/heads/}"
    branch_short="${branch:0:40}"

    # We need to set `LC_ALL` here as `a-z` depends on the locale and might
    # match characters outside of the `a-z` range.
    sanitized=$(echo $branch_short | LC_ALL=C sed -e 's/[^a-zA-Z0-9\-]/-/g')

    # If limiting the length or sanitizing the name changed anything, we also
    # print a checksum to make sure the name stays unique.
    if [[ "$sanitized" != "$branch" ]]; then
        hash=$(echo $branch | md5sum | awk '{ print $1 }')
        echo "$sanitized-${hash:0:8}"
    else
        echo "$sanitized"
    fi
fi
