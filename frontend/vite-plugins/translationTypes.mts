import { existsSync, readFileSync, writeFileSync } from "node:fs";
import * as path from "node:path";
import type { Plugin } from "vite";
import YAML from "yaml";


const SOURCE = "src/i18n/locales/en.yaml";
const TARGET = "src/i18n/_generatedTranslationTypes.json";

/**
 * TypeScript cannot load YAML files, but we want our translations to be
 * well-typed. So we convert the English translations to JSON, which
 * `src/typings/i18next.d.ts` then derives the translation key types from.
 */
export const translationTypes = (): Plugin => {
    const generate = (root: string, yaml: string) => {
        const out = JSON.stringify(YAML.parse(yaml));
        const target = path.join(root, TARGET);

        // Writing it on every build would make file watchers that don't
        // ignore it (e.g. `watchexec --watch src`) rebuild endlessly.
        if (!existsSync(target) || readFileSync(target, "utf8") !== out) {
            writeFileSync(target, out);
        }
    };

    return {
        name: "tobira:translation-types",
        buildStart() {
            const { root } = this.environment.config;
            generate(root, readFileSync(path.join(root, SOURCE), "utf8"));
        },
        // Regenerates the file when the translations change while the dev server runs.
        async hotUpdate({ file, read }) {
            if (this.environment.name !== "client") {
                return;
            }
            const { root } = this.environment.config;
            if (file === path.join(root, SOURCE)) {
                generate(root, await read());
            }
        },
    };
};
