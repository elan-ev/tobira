#!/usr/bin/env bash

MIN_RUST_VERSION="1.63.0"
MIN_NPM_VERSION="7.0"

has_command() {
    command -v "$1" &> /dev/null
}

print_yes() {
    echo -e " → \e[1;32mYes\e[0m"
}

print_no() {
    echo -e " → \e[1;31mNo\e[0m"
}

# Checks if $1 >= $2 with both parameters treated as version numbers.
version_at_least() {
    printf '%s\n%s\n' "$2" "$1" | sort --check=quiet --version-sort
}


echo "Checking tools required to build Tobira..."
exit_code=0


printf "▸ Rust installed? ('rustc' and 'cargo')"
if has_command rustc && has_command cargo; then
    rust_version=$(rustc -V | sed --quiet --regexp-extended 's/rustc ([.0-9]+) .+/\1/p')
    if version_at_least "$rust_version" $MIN_RUST_VERSION; then
        print_yes
    else
        print_no
        exit_code=1
        echo "    Rust version ${rust_version} is too old! Need at least ${MIN_RUST_VERSION}."
        echo
    fi
else
    print_no
    exit_code=1
    echo "    See here for installation: https://www.rust-lang.org/tools/install"
    echo "    Note: Tobira requires a very recent Rust version, so the version from your package manager might be too old."
    echo
fi

printf "▸ NPM installed? ('npm' and 'npx')"
if has_command npm && has_command npx; then
    npm_version=$(npm -v)
    if version_at_least "$npm_version" $MIN_NPM_VERSION; then
        print_yes
    else
        print_no
        exit_code=1
        echo "    NPM version ${npm_version} is too old! Need at least ${MIN_NPM_VERSION}."
        echo
    fi
else
    print_no
    exit_code=1
fi

if [[ $1 == building-only ]]; then
    exit $exit_code;
fi

echo
echo "Checking additional/optional tools for Tobira development..."

printf "▸ docker-compose installed?"
if has_command docker-compose; then
    print_yes
else
    print_no
    exit_code=1
fi

printf "▸ penguin installed?"
if has_command penguin; then
    print_yes
else
    print_no
    exit_code=1
    echo "    To install, run: cargo install -f penguin-app"
    echo
fi

printf "▸ watchexec installed?"
if has_command watchexec; then
    print_yes
else
    print_no
    exit_code=1
    echo "    See here for installation: https://github.com/watchexec/watchexec#install"
    echo
fi

printf "▸ lsof installed?"
if has_command lsof; then
    print_yes
else
    print_no
    exit_code=1
fi

exit $exit_code
