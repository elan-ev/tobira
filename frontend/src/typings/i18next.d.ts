// This imports our translations to get a Typescript type of all valid
// translation keys. Also see:
//
// - https://www.i18next.com/overview/typescript
// - our `webpack.config.js` for where this JSON comes from

import "i18next";
import translation from "../i18n/_generatedTranslationTypes.json";

declare module "i18next" {
    interface CustomTypeOptions {
        resources: {
            translation: typeof translation;
        };
    }
}

