import { TFunction } from "i18next";
import { RegisterOptions } from "react-hook-form";
import { match } from "../../../util";

import { ErrorDisplay } from "../../../util/err";
import { checkPathSegment } from "../../Realm";


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
        // See the comment about path segments in the realm migration
        // for an explanation of these validations.
        // Note that these two places should be kept in sync!
        validate: pathSegment => match(checkPathSegment(pathSegment), {
            "valid": () => true as true | string,
            "too-short": () => t<string>("manage.realm.path-too-short"),
            "control-char": () => t<string>("manage.realm.no-control-in-path"),
            "whitespace": () => t<string>("manage.realm.no-space-in-path"),
            "illegal-chars": () => t<string>("manage.realm.illegal-chars-in-path"),
            "reserved-chars-at-beginning": () => t<string>("manage.realm.reserved-char-in-path"),
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
export const displayCommitError = (error: Error, failedAction: string): JSX.Element => {
    console.error("Error when committing GraphQL mutation:", error);
    return <ErrorDisplay error={error} failedAction={failedAction} />;
};
