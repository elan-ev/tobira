/**
 * Script to find duplicated i18next translation values in a YAML file.
 *
 * Make sure to have the necessary dependencies installed
 * (you can just dump them afterwards) and that the path below point
 * to the translation files that you want to compare (relative to project root).
 *
 * Run with `node util/scripts/i18n/find-duplicate-keys.js` from the project root.
 */

const fs = require("fs");
const yaml = require("js-yaml");


const doc = yaml.load(fs.readFileSync("frontend/src/i18n/locales/en.yaml", "utf8"));

// Flatten keys to { keyPath: value } map
const flatten = (obj, prefix = "", res = {})  =>{
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      flatten(v, path, res);
    } else {
      res[path] = v;
    }
  }
  return res;
}

const flat = flatten(doc);

// Group keys by value
const byValue = Object.entries(flat).reduce((acc, [key, value]) => {
  acc[value] = acc[value] || [];
  acc[value].push(key);
  return acc;
}, {});

// Print only those values that map to multiple keys
for (const [value, keys] of Object.entries(byValue)) {
  if (keys.length > 1) {
    console.log(`"${value}" → ${keys.join(", ")}`);
  }
}