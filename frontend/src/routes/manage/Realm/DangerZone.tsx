import { ReactNode, useRef } from "react";
import { Trans, useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useForm } from "react-hook-form";
import { bug } from "@opencast/appkit";

import type {
    DangerZoneRealmData$data,
    DangerZoneRealmData$key,
} from "./__generated__/DangerZoneRealmData.graphql";
import { currentRef } from "../../../util";
import { Button } from "@opencast/appkit";
import { Card } from "../../../ui/Card";
import { PathSegmentInput } from "../../../ui/PathSegmentInput";
import { boxError } from "../../../ui/error";
import { displayCommitError, realmValidations } from "./util";
import {
    DangerZoneRemoveRealmMutation$data,
} from "./__generated__/DangerZoneRemoveRealmMutation.graphql";
import { useRouter } from "../../../router";
import { useState } from "react";
import { ConfirmationModal, ConfirmationModalHandle } from "../../../ui/Modal";
import { COLORS } from "../../../color";
import { ManageRealmRoute } from ".";


const fragment = graphql`
    fragment DangerZoneRealmData on Realm {
        id
        name
        isMainRoot
        isUserRoot
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

    const Section: React.FC<{ children: ReactNode }> = ({ children }) => (
        <div css={{
            padding: "16px 16px",
            "&:not(:last-child)": {
                borderBottom: `1px solid ${COLORS.danger0}`,
            },
            "& > h3": {
                marginBottom: 16,
            },
        }}>{children}</div>
    );

    return <>
        <h2>{t("manage.realm.danger-zone.heading")}</h2>
        {realm.isMainRoot
            ? <p>{t("manage.realm.danger-zone.root-note")}</p>
            : (
                <div css={{
                    border: `2px solid ${COLORS.danger0}`,
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
    realm: DangerZoneRealmData$data;
};

const ChangePath: React.FC<InnerProps> = ({ realm }) => {
    type FormData = {
        pathSegment: string;
    };

    const router = useRouter();
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

    if (realm.isUserRoot) {
        return <>
            <h3>{t("manage.realm.danger-zone.change-path.heading")}</h3>
            <p css={{ fontSize: 14 }}>
                {t("manage.realm.danger-zone.change-path.cannot-userrealm")}
            </p>
        </>;
    }

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
                router.replace(ManageRealmRoute.url({ realmPath: newPath }));
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
    const [commit] = useMutation(removeRealmMutation);
    const router = useRouter();
    const modalRef = useRef<ConfirmationModalHandle>(null);

    const remove = () => {
        commit({
            variables: {
                id: realm.id,
            },
            updater: store => store.delete(realm.id),
            onCompleted: response => {
                const typedResponse = response as DangerZoneRemoveRealmMutation$data;
                router.goto(typedResponse.removeRealm.parent?.path ?? "/");
            },
            onError: error => {
                const failedAction = t("manage.realm.danger-zone.delete.failed");
                currentRef(modalRef).reportError(displayCommitError(error, failedAction));
            },
        });
    };

    const buttonContent = realm.numberOfDescendants === 0
        ? t("manage.realm.danger-zone.delete.button-single")
        : <span>
            <Trans i18nKey="manage.realm.danger-zone.delete.button">
                {{ numSubPages: realm.numberOfDescendants }}
            </Trans>
        </span>;

    return <>
        <h3>{t("manage.realm.danger-zone.delete.heading")}</h3>
        <p css={{ fontSize: 14 }}>
            {t("manage.realm.danger-zone.delete.warning")}
        </p>
        <div css={{ marginTop: 32, textAlign: "center" }}>
            <Button kind="danger" onClick={() => currentRef(modalRef).open()}>
                <span css={{ whiteSpace: "normal", textWrap: "balance" }}>
                    {buttonContent}
                </span>
            </Button>
        </div>
        <ConfirmationModal
            title={t("manage.realm.danger-zone.delete.confirm-removal")}
            {...{ buttonContent }}
            onSubmit={remove}
            ref={modalRef}
            text={{ generalActionClose: t("general.action.close") }}
        >
            <p>
                <Trans i18nKey="manage.realm.danger-zone.delete.cannot-be-undone" />
            </p>
        </ConfirmationModal>
    </>;
};
