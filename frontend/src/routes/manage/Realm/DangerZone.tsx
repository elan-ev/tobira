import { Trans, useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useForm } from "react-hook-form";

import type {
    DangerZoneRealmData,
    DangerZoneRealmData$key,
} from "../../../query-types/DangerZoneRealmData.graphql";
import { bug } from "../../../util/err";
import { Button } from "../../../ui/Button";
import { Card } from "../../../ui/Card";
import { PathSegmentInput } from "../../../ui/PathSegmentInput";
import { boxError } from "../../../ui/error";
import { displayCommitError, realmValidations } from "./util";
import { Spinner } from "../../../ui/Spinner";
import {
    DangerZoneRemoveRealmMutationResponse,
} from "../../../query-types/DangerZoneRemoveRealmMutation.graphql";
import { useRouter } from "../../../router";
import { FormEvent, useState } from "react";
import { Modal } from "../../../ui/Modal";


const fragment = graphql`
    fragment DangerZoneRealmData on Realm {
        id
        name
        isRoot
        path
        numberOfDescendants
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
                    <Section><RemoveRealm realm={realm} /></Section>
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
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        mode: "onChange",
    });

    const pathSegmentRegex = /[^/]+$/;
    const currentPathSegment = realm.path.match(pathSegmentRegex)?.[0]
        ?? bug("no path segment in path");
    const typedPathSegment = watch("pathSegment", currentPathSegment);

    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [commit, isInFlight] = useMutation(changePathMutation);

    const onSubmit = handleSubmit(data => {
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
            onError: error => {
                const failure = t("manage.realm.danger-zone.change-path.failed");
                setCommitError(displayCommitError(error, failure));
            },
        });
    });

    return <>
        <h3>{t("manage.realm.danger-zone.change-path.heading")}</h3>
        <p css={{ fontSize: 14 }}>{t("manage.realm.danger-zone.change-path.warning")}</p>
        <form onSubmit={onSubmit} css={{ marginTop: 32, textAlign: "center" }}>
            <div css={{ marginBottom: 16 }}>
                <PathSegmentInput
                    base={realm.path.replace(pathSegmentRegex, "")}
                    spinner={isInFlight}
                    error={!!errors.pathSegment}
                    defaultValue={currentPathSegment}
                    {...register("pathSegment", realmValidations(t).path)}
                />
            </div>
            {errors.pathSegment && <>
                <Card kind="error" css={{ marginBottom: 16 }}>
                    {errors.pathSegment.message}
                </Card>
                <br />
            </>}
            <Button
                kind="danger"
                type="submit"
                disabled={typedPathSegment === currentPathSegment || isInFlight}
            >
                {t("manage.realm.danger-zone.change-path.button")}
            </Button>
            {boxError(commitError)}
        </form>
    </>;
};

// We fetch all `NavigationData` to update our local cache and show the correct
// new children, without the removed realm.
const removeRealmMutation = graphql`
    mutation DangerZoneRemoveRealmMutation($id: ID!) {
        removeRealm(id: $id) {
            parent {
                path
                ... NavigationData
            }
        }
    }
`;

const RemoveRealm: React.FC<InnerProps> = ({ realm }) => {
    const { t } = useTranslation();
    const [commit, isInFlight] = useMutation(removeRealmMutation);
    const router = useRouter();
    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [modalActive, setModalActive] = useState(false);

    const remove = (e: FormEvent) => {
        setCommitError(null);
        commit({
            variables: {
                id: realm.id,
            },
            onCompleted: response => {
                const typedResponse = response as DangerZoneRemoveRealmMutationResponse;
                router.goto(typedResponse.removeRealm.parent.path);
            },
            onError: error => {
                const failedAction = t("manage.realm.danger-zone.delete.failed");
                setCommitError(displayCommitError(error, failedAction));
            },
        });
        e.preventDefault();
    };

    const buttonContent = realm.numberOfDescendants === 0
        ? t("manage.realm.danger-zone.delete.button-single")
        : <Trans
            i18nKey="manage.realm.danger-zone.delete.button"
            values={{ numSubPages: realm.numberOfDescendants }}
        >Foo<strong>count</strong>Bar</Trans>;

    return <>
        <h3>{t("manage.realm.danger-zone.delete.heading")}</h3>
        <p css={{ fontSize: 14 }}>
            {t("manage.realm.danger-zone.delete.warning")}
        </p>
        <div css={{ marginTop: 32, textAlign: "center" }}>
            <Button kind="danger" onClick={() => setModalActive(true)}>
                <span>{buttonContent}</span>
            </Button>
        </div>
        {modalActive && (
            <Modal title={t("manage.are-you-sure")} close={() => setModalActive(false)}>
                <p>
                    <Trans i18nKey="manage.realm.danger-zone.delete.cannot-be-undone">
                        foo<strong>bar</strong>baz
                    </Trans>
                </p>
                <form onSubmit={remove} css={{ marginTop: 32, textAlign: "center" }}>
                    <Button kind="danger">
                        <span>{buttonContent}</span>
                    </Button>
                    {isInFlight && <div css={{ marginTop: 16 }}><Spinner size={20} /></div>}
                </form>
                {boxError(commitError)}
            </Modal>
        )}
    </>;
};
