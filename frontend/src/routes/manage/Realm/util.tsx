import { TFunction } from "i18next";
import { RegisterOptions } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { APIError, NetworkError, NotJson, ServerError } from "../../../relay/errors";
import { match } from "../../../util";


type RealmValidations = {
    name: RegisterOptions;
    path: RegisterOptions;
};

export const realmValidations = (t: TFunction): RealmValidations => ({
    name: {
        required: t<string>("manage.realm.name-must-not-be-empty"),
    },
    path: {
        required: t<string>("manage.realm.path-must-not-be-empty"),
        minLength: {
            value: 2,
            message: t("manage.realm.path-too-short"),
        },
        pattern: {
            // Lowercase letter, decimal number or dash.
            value: /^(\p{Ll}|\p{Nd}|-)*$/u,
            message: t("manage.realm.path-must-be-alphanum-dash"),
        },
        // TODO: check if path already exists
    },
});

export const RealmSettingsContainer: React.FC = ({ children }) => (
    <div css={{
        maxWidth: 900,
        // Without this, some "on focus" box shadows are clipped as the parent
        // element has "overflow: hidden".
        marginLeft: 2,
        "& > section": {
            marginBottom: 64,
            "& > h2": { marginBottom: 16 },
        },
    }}>{children}</div>
);

/** Returns an element that displays the given mutation error as best as possible. */
export const displayCommitError = (error: Error, failedAction: string): JSX.Element => {
    const Inner: React.FC<{ error: Error }> = ({ error }) => {
        const { t, i18n } = useTranslation();

        let errors = [t("errors.unknown")];

        // We always expect it to be an API error.
        if (error instanceof APIError) {
            errors = error.errors.map(e => {
                // Use a message fitting to the exact error key, if it is present.
                const translationKey = e.key ? `api-remote-errors.${e.key}` : null;
                if (translationKey && i18n.exists(translationKey)) {
                    return t(translationKey);
                }

                // Otherwise we check the error kind. We expect it to always be
                // present, but to be defensive/careful about this we also
                // handle the case where some unexpected API error might be
                // returned.
                if (!e.kind) {
                    return t("errors.unknown");
                }

                return match(e.kind, {
                    "INTERNAL_SERVER_ERROR": () => t("errors.internal-server-error"),
                    "NOT_AUTHORIZED": () => t("errors.not-authorized"),
                    "INVALID_INPUT": () => t("errors.invalid-input"),
                });
            });
        } else if (error instanceof NetworkError) {
            errors = [t("errors.network-error")];
        } else if (error instanceof ServerError) {
            errors = [t("errors.internal-server-error")];
        } else if (error instanceof NotJson) {
            errors = [t("errors.unexpected-response")];
        }

        return errors.length === 1
            ? <>{failedAction + " " + errors[0]}</>
            : <div css={{ padding: "4px 0" }}>
                {failedAction}
                <ul css={{ marginBottom: 0, marginTop: 8, paddingLeft: 24 }}>
                    {errors.map(e => <li key={e}>{e}</li>)}
                </ul>
            </div>;
    };


    console.error("Error when committing GraphQL mutation:", error);
    return <Inner error={error} />;
};
