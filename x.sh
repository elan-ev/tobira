#!/usr/bin/env bash

basedir=$(dirname "$0")


if [[ $# -lt 1 ]]; then
    >&2 echo "Missing argument! Run like './x.sh <command>'"
    >&2 echo
    >&2 echo "x.sh is a helper script for Tobira development. You need to pass it some argument"
    >&2 echo "to tell it what to do. It mostly dispatches to the scripts in 'util/scripts'."
    >&2 echo
    >&2 echo "Useful commands:"
    >&2 echo "  - ./x.sh check-system"
    >&2 echo "        Check if you have all the tools required for Tobira development"
    >&2 echo
    >&2 echo "  - ./x.sh start"
    >&2 echo "        Starts a development server on http://localhost:8030, watches all files"
    >&2 echo "        for modifications, automatically rebuilds when necessary and then reloads"
    >&2 echo "        your browser session."
    >&2 echo
    >&2 echo "  - ./x.sh clean"
    >&2 echo "        Cleans all build artifacts, temporary files and the 'deploy' folder"
    >&2 echo
    >&2 echo "  - ./x.sh build-release"
    >&2 echo "        Creates a clean production build that can be deployed."
    >&2 echo
    >&2 echo "  - ./x.sh containers [start|stop|run]"
    >&2 echo "        Manages all dev containers. To only start/stop some of them, use"
    >&2 echo "        docker-compose manually in 'util/containers'"
    exit 1
fi

# Manage the dev containers
containers() {
    docker_command="docker-compose -f $basedir/util/containers/docker-compose.yml"
    case "$1" in
        "start")
            (set -x; $docker_command up -d)
            ;;
        "stop")
            (set -x; $docker_command stop)
            ;;
        "run")
            (set -x; $docker_command up)
            ;;
        *)
            >&2 echo "Incorrect argument for 'containers' command!"
            >&2 echo "Allowed: 'start', 'stop', 'run'. Example: './x.sh containers start'"
            exit 1
            ;;
    esac

}


case "$1" in
    "check-system")
        "$basedir"/util/scripts/check-system.sh
        ;;
    "clean")
        "$basedir"/util/scripts/clean.sh
        ;;
    "start")
        if ! "$basedir"/util/scripts/check-system.sh > /dev/null; then
            >&2 echo "Your system is missing some tools. Run './x.sh check-system' for more information"
            exit 1
        fi
        "$basedir"/util/scripts/start-dev.sh
        ;;
    "build-release")
        if ! "$basedir"/util/scripts/check-system.sh building-only > /dev/null; then
            >&2 echo "Your system is missing some tools. Run './x.sh check-system' for more information"
            exit 1
        fi
        "$basedir"/util/scripts/build-release.sh
        ;;
    "containers")
        containers "$2"
        ;;
    *)
        foo;
        ;;
esac