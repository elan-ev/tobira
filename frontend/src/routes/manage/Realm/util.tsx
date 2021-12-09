import { TFunction } from "i18next";
import { RegisterOptions } from "react-hook-form";

import { ErrorDisplay } from "../../../util/err";


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

type RealmSettingsContainerProps = JSX.IntrinsicElements["div"];

export const RealmSettingsContainer: React.FC<RealmSettingsContainerProps> = ({
    children,
    ...rest
}) => (
    <div
        css={{
            // Without this, some "on focus" box shadows are clipped as the parent
            // element has "overflow: hidden".
            marginLeft: 2,
            "& > section": {
                marginBottom: 64,
                "& > h2": { marginBottom: 16 },
            },
        }}
        {...rest}
    >{children}</div>
);

/** Returns an element that displays the given mutation error as best as possible. */
export const displayCommitError = (error: Error, failedAction: string): JSX.Element => {
    console.error("Error when committing GraphQL mutation:", error);
    return <ErrorDisplay error={error} failedAction={failedAction} />;
};
