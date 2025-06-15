/**
 * Script to find unused i18next translation keys.
 * Removes each key from the translation file one by one,
 * runs a type-check, and reports which keys were never referenced in the code.
 *
 * Make sure to have the necessary dependencies installed
 * (you can just dump them afterwards) and that the path below point
 * to the translation files that you want to compare.
 *
 * Run with `node util/scripts/i18n/find-unused-keys.js` from the project root.
 *
 * Some notes:
 * - This is very inefficient performance wise and will probably
 * take between one and two hours to run with the current translation file.
 *
 * - It will not work with keys that have both a `_one` and `_other` variant
 * and are used with a {{count}} variable, as it will only remove one of them at a time.
 * There are currently three in total which you will have to check manually.
 *
 * - It will report false positives for keys that are only used in backend (`api-remote-errors`).
 *
 * - If the script fails or is interrupted, it will **not** restore the original translation file,
 * so make sure to have a backup before running it.
 */

const fs = require("fs");
const path = require("path");
const child_process = require("child_process");
const yaml = require("js-yaml");


const TRANSLATION_FILE = path.join(__dirname, "../../../frontend/src/i18n/locales/en.yaml");

// Type-check command
const CHECK_CMD = "(cd frontend && npx webpack --mode=development --stats=errors-warnings)";

// ────────────────────────────────────────────────────────────────────────────────

// Helper to recursively collect all nested key-paths.
const collectKeyPaths = (obj, prefix = []) => {
  const results = [];
  Object.entries(obj).forEach(([k, v]) => {
    const currentPath = prefix.concat(k);
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      results.push(...collectKeyPaths(v, currentPath));
    } else {
      results.push(currentPath);
    }
  });
  return results;
}

// Helper to recursively delete nested keys.
const deleteKeyAtPath = (obj, pathArray) => {
  if (pathArray.length === 0) return;
  const [first, ...rest] = pathArray;
  if (!(first in obj)) return;
  if (rest.length === 0) {
    delete obj[first];
  } else if (obj[first] && typeof obj[first] === "object") {
    deleteKeyAtPath(obj[first], rest);
    if (Object.keys(obj[first]).length === 0) {
      delete obj[first];
    }
  }
}


// Main script execution
(async () => {
  // 1) Read and parse the original YAML
  let rawYaml;
  try {
    rawYaml = fs.readFileSync(TRANSLATION_FILE, "utf8");
  } catch (err) {
    console.error(`❌ Cannot read ${TRANSLATION_FILE}: ${err.message}`);
    process.exit(1);
  }

  let originalDoc;
  try {
    originalDoc = yaml.load(rawYaml);
    if (typeof originalDoc !== "object" || originalDoc === null) {
      throw new Error("Parsed YAML is not an object.");
    }
  } catch (err) {
    console.error(`❌ Error parsing ${TRANSLATION_FILE}: ${err.message}`);
    process.exit(1);
  }

  // Save the original file content to restore it later
  const originalFileContent = rawYaml;

  // 2) Collect all key paths (e.g. [["common","hello"], ["home","title"], …])
  const allKeyPaths = collectKeyPaths(originalDoc);

  if (allKeyPaths.length === 0) {
    console.log("No translation keys found in", TRANSLATION_FILE);
    process.exit(0);
  }

  console.log(`🔍 Found ${allKeyPaths.length} translation keys. Checking usage…\n`);

  // 3) For each key, remove it from a fresh clone of the original file and run a type-check.
  const unusedKeys = [];
  for (let i = 0; i < allKeyPaths.length; i++) {
    const keyPath = allKeyPaths[i];
    const keyString = keyPath.join(".");

    const workingCopy = JSON.parse(JSON.stringify(originalDoc));
    deleteKeyAtPath(workingCopy, keyPath);

    const newYaml = yaml.dump(workingCopy);
    fs.writeFileSync(TRANSLATION_FILE, newYaml, "utf8");

    let hasError = false;
    try {
      child_process.execSync(CHECK_CMD, { stdio: "ignore" });
      // Exit code 0: no TS error ⇒ key is unused.
    } catch (err) {
      // Non-zero exit code: TS error (missing key) ⇒ key is used somewhere.
      hasError = true;
    }

    if (!hasError) {
      unusedKeys.push(keyString);
      console.log(`  [UNUSED]  ${keyString}`);
    } else {
      process.stdout.write(`  [USED]    ${keyString}\r`);
      console.log(`  [USED]    ${keyString}`);
    }
  }

  // 4) Restore original YAML file.
  fs.writeFileSync(TRANSLATION_FILE, originalFileContent, "utf8");

  // 5) Print summary.
  console.log("\n────────────────────────────────────────────────");
  if (unusedKeys.length === 0) {
    console.log("✅ No unused translations detected.");
  } else {
    console.log(`✅ Found ${unusedKeys.length} unused keys:`);
    unusedKeys.forEach((k) => console.log(`    • ${k}`));
  }
})();
