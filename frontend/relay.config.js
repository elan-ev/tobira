"use strict";

const path = require("path");
const { APP_PATH } = require("./constants");

module.exports = {
    src: APP_PATH,
    schema: path.join(APP_PATH, "schema.graphql"),
    language: "typescript",
    artifactDirectory: path.join(APP_PATH, "query-types"),
};
