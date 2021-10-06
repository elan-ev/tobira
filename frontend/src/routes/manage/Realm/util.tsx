import { TFunction } from "i18next";
import { MutableRefObject, useEffect } from "react";
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
    children == null
        ? null
        : <div css={{ marginTop: 8 }}>
            <Card kind="error">{children}</Card>
        </div>
);

export const useOnOutsideClick = (
    ref: MutableRefObject<Node | null>,
    callback: () => void,
): void => {
    useEffect(() => {
        const handler = (event: MouseEvent) => {
            const target = event.target;
            if (ref.current && target instanceof Element && !ref.current.contains(target)) {
                callback();
            }
        };

        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    });
};

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
