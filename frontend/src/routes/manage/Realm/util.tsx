import { TFunction } from "i18next";
import { RegisterOptions } from "react-hook-form";
import { match } from "@opencast/appkit";

import { ErrorDisplay } from "../../../util/err";
import { checkPathSegment, ILLEGAL_CHARS, RESERVED_CHARS } from "../../Realm";


type RealmValidations = {
    name: RegisterOptions;
    path: RegisterOptions;
};

export const realmValidations = (t: TFunction): RealmValidations => ({
    name: {
        required: t("manage.realm.name-must-not-be-empty"),
    },
    path: {
        required: t("manage.realm.path-must-not-be-empty"),
        // See the comment about path segments in the realm migration
        // for an explanation of these validations.
        // Note that these two places should be kept in sync!
        validate: pathSegment => match(checkPathSegment(pathSegment), {
            "valid": () => true as true | string,
            "too-short": () => t("manage.realm.path-too-short"),
            "control-char": () => t("manage.realm.no-control-in-path"),
            "whitespace": () => t("manage.realm.no-space-in-path"),
            "illegal-chars": () => t("manage.realm.illegal-chars-in-path",
                { illegalChars: ILLEGAL_CHARS }),
            "reserved-chars-at-beginning": () => t("manage.realm.reserved-char-in-path",
                { reservedChars: RESERVED_CHARS }),
        }),
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
export const displayCommitError = (error: Error, failedAction?: string): JSX.Element => {
    // eslint-disable-next-line no-console
    console.error("Error when committing GraphQL mutation:", error);
    return <ErrorDisplay error={error} failedAction={failedAction} />;
};
