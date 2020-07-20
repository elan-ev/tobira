#!/bin/sh

set -e

NAME="tobira-dev-postgres"

if [ "$(docker ps -q -f name=$NAME)" ]; then
    echo "Docker image for Tobira Postgres is already running!"
elif [ "$(docker ps -qa -f name=$NAME)" ]; then
    echo "Docker image for Tobira Postgres is stopped. Starting..."
    docker start $NAME
    echo "Postgres should now be running and listening on port 5435"
else
    echo "Docker image for Tobira Postgres does not exist yet. Creating..."
    docker run --name $NAME \
        -p 5435:5432 \
        -e POSTGRES_PASSWORD=tobira-dev-db-pw \
        -e POSTGRES_USER=tobira \
        -e POSTGRES_DB=tobira \
        -v tobira-dev-postgres:/var/lib/postgresql/data \
        -d \
        postgres
    echo "Image created."
    echo "Postgres should now be running and listening on port 5435"
fi

echo "(Run 'docker stop $NAME' to stop the container)"
