#!/bin/sh

set -e

NAME="portal-dev-postgres"

if [ "$(docker ps -q -f name=$NAME)" ]; then
    echo "Docker image for Portal Postgres is already running!"
elif [ "$(docker ps -qa -f name=$NAME)" ]; then
    echo "Docker image for Portal Postgres is stopped. Starting..."
    docker start $NAME
    echo "Postgres should now be running and listening on port 5435"
else
    echo "Docker image for Portal Postgres does not exist yet. Creating..."
    docker run --name $NAME \
        -p 5435:5432 \
        -e POSTGRES_PASSWORD=portal-dev-db-pw \
        -e POSTGRES_USER=portal \
        -e POSTGRES_DB=portal \
        -v portal-dev-postgres:/var/lib/postgresql/data \
        -d \
        postgres
    echo "Image created."
    echo "Postgres should now be running and listening on port 5435"
fi

echo "(Run 'docker stop $NAME' to stop the container)"
