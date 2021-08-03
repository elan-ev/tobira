import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useForm } from "react-hook-form";

import type {
    DangerZoneRealmData,
    DangerZoneRealmData$key,
} from "../../../query-types/DangerZoneRealmData.graphql";
import { bug } from "../../../util/err";
import { Button } from "../../../ui/Button";
import { Input } from "../../../ui/Input";
import { Card } from "../../../ui/Card";
import { Spinner } from "../../../ui/Spinner";


const fragment = graphql`
    fragment DangerZoneRealmData on Realm {
        id
        name
        isRoot
        path
    }
`;

type Props = {
    fragRef: DangerZoneRealmData$key;
};

/**
 * Realm settings that should not be changed lightly.
 */
export const DangerZone: React.FC<Props> = ({ fragRef }) => {
    const { t } = useTranslation();
    const realm = useFragment(fragment, fragRef);

    const Section: React.FC = ({ children }) => (
        <div css={{
            padding: "16px 16px",
            "&:not(:last-child)": {
                borderBottom: "1px solid var(--danger-color)",
            },
            "& > h3": {
                marginBottom: 16,
            },
        }}>{children}</div>
    );

    return <>
        <h2>{t("manage.realm.danger-zone.heading")}</h2>
        {realm.isRoot
            ? <p>{t("manage.realm.danger-zone.root-note")}</p>
            : (
                <div css={{
                    border: "2px solid var(--danger-color)",
                    borderRadius: 4,
                    margin: 8,
                    marginBottom: 96,
                    marginTop: 16,
                }}>
                    <Section><ChangePath realm={realm} /></Section>
                </div>
            )
        }
    </>;
};

const changePathMutation = graphql`
    mutation DangerZoneChangePathMutation($id: ID!, $set: UpdateRealm!) {
        updateRealm(id: $id, set: $set) {
            ... DangerZoneRealmData
        }
    }
`;

type InnerProps = {
    realm: DangerZoneRealmData;
};

const ChangePath: React.FC<InnerProps> = ({ realm }) => {
    type FormData = {
        pathSegment: string;
    };

    const { t } = useTranslation();
    const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<FormData>({
        mode: "onChange",
    });

    const pathSegmentRegex = /[^/]+$/;
    const currentPathSegment = realm.path.match(pathSegmentRegex)?.[0]
        ?? bug("no path segment in path");
    const typedPathSegment = watch("pathSegment", currentPathSegment);

    const [commit, isInFlight] = useMutation(changePathMutation);

    const onSubmit = handleSubmit(data => {
        // TODO: confirmation dialog!

        commit({
            variables: {
                id: realm.id,
                set: {
                    pathSegment: data.pathSegment,
                },
            },
            onCompleted: () => {
                // We have to change the current URL path, otherwise the URL is invalid.
                const newPath = realm.path.replace(pathSegmentRegex, data.pathSegment);
                const newUrl = `/~manage/realm?path=${newPath}`;
                window.history.pushState(null, "", newUrl);
            },
            onError: _error => {
                setError("pathSegment", {
                    type: "manual",
                    message: t("manage.realm.danger-zone.change-path.generic-network-error"),
                });
            },
        });
    });

    const validation = {
        required: t("manage.realm.danger-zone.change-path.must-not-be-empty"),
        minLength: {
            value: 2,
            message: t("manage.realm.danger-zone.change-path.at-least-2-long"),
        },
        pattern: {
            // Lowercase letter, decimal number or dash.
            value: /^(\p{Ll}|\p{Nd}|-)*$/u,
            message: t("manage.realm.danger-zone.change-path.must-be-alphanum-dash"),
        },
        // TODO: check if path already exists
    };

    return <>
        <h3>{t("manage.realm.danger-zone.change-path.heading")}</h3>
        <p css={{ fontSize: 14 }}>{t("manage.realm.danger-zone.change-path.warning")}</p>
        <form onSubmit={onSubmit} css={{ marginTop: 32, textAlign: "center" }}>
            <div css={{ marginBottom: 16 }}>
                <div css={{
                    display: "inline-flex",
                    position: "relative",
                    alignItems: "center",
                    border: "1px solid var(--grey92)",
                    borderRadius: 4,
                    backgroundColor: "var(--grey97)",
                }}>
                    <span css={{ padding: "0 8px" }}>
                        {realm.path.replace(pathSegmentRegex, "")}
                    </span>
                    <Input
                        error={!!errors.pathSegment}
                        defaultValue={currentPathSegment}
                        css={{ margin: -1 }}
                        {...register("pathSegment", validation)}
                    />
                    {isInFlight && <Spinner size={20} css={{ position: "absolute", right: 6 }}/>}
                </div>
            </div>
            {errors.pathSegment && <>
                <Card kind="error" css={{ marginBottom: 16 }}>
                    {errors.pathSegment.message}
                </Card>
                <br />
            </>}
            <Button
                danger
                type="submit"
                disabled={typedPathSegment === currentPathSegment || isInFlight}
            >
                {t("manage.realm.danger-zone.change-path.button")}
            </Button>
        </form>
    </>;
};

