"use strict";

const path = require("path");
const APP_PATH = path.join(__dirname, "src");

module.exports = {
    src: APP_PATH,
    schema: path.join(APP_PATH, "schema.graphql"),
    language: "typescript",
    customScalarTypes: {
        "DateTime": "string",
        "Cursor": "string",
        "ByteSpan": "string",
        "ExtraMetadata": "Record<string, Record<string, string[]>>",
        "TranslatedString": "{ default: string } & Record<string, string | undefined>",
    },
    schemaExtensions: [APP_PATH],
};
