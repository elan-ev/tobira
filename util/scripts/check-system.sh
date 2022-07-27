#!/usr/bin/env bash


has_command() {
    command -v "$1" &> /dev/null
}

print_yes() {
    echo -e " → \e[1;32mYes\e[0m"
}

print_no() {
    echo -e " → \e[1;31mNo\e[0m"
}


echo "Checking tools required to build Tobira..."
exit_code=0


printf "▸ Rust installed? ('rustc' and 'cargo')"
if has_command rustc && has_command cargo; then
    print_yes
else
    print_no
    exit_code=1
    echo "    See here for installation: https://www.rust-lang.org/tools/install"
    echo "    Note: Tobira requires a very recent Rust version, so the version from your package manager might be too old."
    echo
fi

printf "▸ NPM installed? ('npm' and 'npx')"
if has_command npm && has_command npx; then
    print_yes
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
