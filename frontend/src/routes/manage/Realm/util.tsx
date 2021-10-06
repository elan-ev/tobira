import { TFunction } from "i18next";
import { ReactNode } from "react";
import { RegisterOptions } from "react-hook-form";

import { Card } from "../../../ui/Card";


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

export const ErrorBox: React.FC = ({ children }) => (
    <div css={{ marginTop: 8 }}>
        <Card kind="error">{children}</Card>
    </div>
);

/**
 * If the given error is not `null` nor `undefined`, returns an `<ErrorBox>`
 * with it as content. Returns `null` otherwise.
 */
export const boxError = (err: ReactNode): JSX.Element | null => (
    err == null ? null : <ErrorBox>{err}</ErrorBox>
);

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
