/**
 * Script to compare i18next translation keys in two YAML files.
 *
 * Run with `node util/scripts/i18n/compare-keys.js` from the project root.
 * Use the `-o` or `--check-order` flag to check the key order.
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");


// Check for flags
const args = process.argv.slice(2);
const checkOrder = args.includes("-o") || args.includes("--check-order");

const LANG_A = {
  name: "en",
  file: path.join(__dirname, "../../../frontend/src/i18n/locales/en.yaml"),
};
const LANG_B = {
  name: "de",
  file: path.join(__dirname, "../../../frontend/src/i18n/locales/de.yaml"),
};

const loadYamlObject = (filepath) => {
  let raw;
  try {
    raw = fs.readFileSync(filepath, "utf8");
  } catch (err) {
    console.error(`❌ Cannot read ${filepath}: ${err.message}`);
    process.exit(1);
  }

  let doc;
  try {
    doc = yaml.load(raw);
    if (typeof doc !== "object" || doc === null) {
      throw new Error("Parsed YAML is not an object");
    }
  } catch (err) {
    console.error(`❌ Error parsing ${filepath}: ${err.message}`);
    process.exit(1);
  }

  return doc;
};

// Recursively walk through parsed YAML in insertion order to build array of dotted key‐paths.
// e.g. { common: { hello: "Hello", world: "World" }, cat: { dog: "mouse" } }
// → ["common.hello", "common.world", "cat.dog"]
const collectKeyPaths = (obj, prefix = []) => {
  const result = [];
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    const pathSoFar = prefix.concat(key);
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      result.push(...collectKeyPaths(value, pathSoFar));
    } else {
      result.push(pathSoFar.join("."));
    }
  }
  return result;
};

const diffArrays = (a, b) => {
  const setA = new Set(a);
  const setB = new Set(b);
  const onlyInA = [...setA].filter((k) => !setB.has(k));
  const onlyInB = [...setB].filter((k) => !setA.has(k));
  return [onlyInA, onlyInB];
};

const findOrderDifferences = (keysA, keysB) => {
  // Only consider keys present in both files
  const setA = new Set(keysA);
  const setB = new Set(keysB);
  const commonKeys = keysA.filter(k => setB.has(k));
  const orderInA = commonKeys;
  const orderInB = keysB.filter(k => setA.has(k));
  const mismatches = [];
  for (let i = 0; i < Math.min(orderInA.length, orderInB.length); i++) {
    if (orderInA[i] !== orderInB[i]) {
      mismatches.push({ keyA: orderInA[i], keyB: orderInB[i], index: i });
    }
  }
  return mismatches;
};

(() => {
  console.log("Loading keys from translation files…\n");

  const aKeys = collectKeyPaths(loadYamlObject(LANG_A.file));
  const bKeys = collectKeyPaths(loadYamlObject(LANG_B.file));

  console.log(`  • ${aKeys.length} keys in "${LANG_A.name}.yaml"`);
  console.log(`  • ${bKeys.length} keys in "${LANG_B.name}.yaml"\n`);

  // 1) Check for missing keys in either file
  const [onlyInA, onlyInB] = diffArrays(aKeys, bKeys);

  let hasError = false;

  if (onlyInA.length > 0) {
    console.error(`❌ Keys present in ${LANG_A.name}.yaml but missing in "${LANG_B.name}.yaml":`);
    onlyInA.forEach((k) => console.error(`    • ${k}`));
    console.error("");
    hasError = true;
  }

  if (onlyInB.length > 0) {
    console.error(`❌ Keys present in ${LANG_B.name}.yaml but missing in "${LANG_A.name}.yaml":`);
    onlyInB.forEach((k) => console.error(`    • ${k}`));
    console.error("");
    hasError = true;
  }

  // 2) Check ordering if the flag is present, but only for keys present in both files
  if (checkOrder) {
    console.log("\n🔄 Checking key order…");
    const orderMismatches = findOrderDifferences(aKeys, bKeys);

    if (orderMismatches.length === 0) {
      console.log("✅ Key order matches exactly for all keys that exist in both files.");
    } else {
      console.error(`❌ Found ${orderMismatches.length} key order mismatches:`);
      orderMismatches.forEach(({ keyA, keyB, index }) => {
        console.error(`    • At position ${index}: ${LANG_A.name}: "${keyA}" vs ${LANG_B.name}: "${keyB}"`);
      });
      hasError = true;
    }
  } else {
    console.log("\n🔄 Skipping key order check. Use the -o or --check-order flag to enable it.");
  }

  if (hasError) {
    console.error("\n❗ Translation key check FAILED.");
    process.exit(1);
  } else {
    console.log("\n✅ All keys match and are in the same order. No differences found.");
    process.exit(0);
  }
})();

