"use strict";

const path = require("path");
const { APP_PATH } = require("./constants");

module.exports = {
    src: APP_PATH,
    schema: path.join(APP_PATH, "schema.graphql"),
    language: "typescript",
    customScalars: {
        "DateTimeUtc": "string",
        "Cursor": "string",
    },
    schemaExtensions: [APP_PATH],
};
