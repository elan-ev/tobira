import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import type {
    DangerZoneRealmData,
    DangerZoneRealmData$key,
} from "../../../query-types/DangerZoneRealmData.graphql";
import { useForm } from "react-hook-form";
import { bug } from "../../../util/err";


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

    return <>
        <h2>{t("manage.realm.danger-zone.heading")}</h2>
        {realm.isRoot
            ? <p>{t("manage.realm.danger-zone.root-note")}</p>
            : <>
                <ChangePath realm={realm} />
            </>
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
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>();

    const pathSegmentRegex = /[^/]+$/;
    const currentPathSegment = realm.path.match(pathSegmentRegex)?.[0]
        ?? bug("no path segment in path");
    const typedPathSegment = watch("pathSegment", currentPathSegment);

    const [commit, _isInFlight] = useMutation(changePathMutation);

    const onSubmit = handleSubmit(data => {
        // TODO: confirmation dialog!

        commit({
            variables: {
                id: realm.id,
                set: {
                    pathSegment: data.pathSegment,
                },
            },
        });

        // We have to change the current URL path, otherwise the URL is invalid.
        const newPath = realm.path.replace(pathSegmentRegex, data.pathSegment);
        const newUrl = `/~manage/realm?path=${newPath}`;
        window.history.pushState(null, "", newUrl);
    });


    return (
        <div>
            <h3>{t("manage.realm.danger-zone.change-path.heading")}</h3>
            <p>{t("manage.realm.danger-zone.change-path.warning")}</p>
            <form onSubmit={onSubmit} css={{ marginTop: 32, marginBottom: 64 }}>
                {realm.path.replace(pathSegmentRegex, "")}
                <input
                    defaultValue={currentPathSegment}
                    {...register("pathSegment", { required: true })}
                />
                <br />
                <button
                    type="submit"
                    disabled={typedPathSegment === currentPathSegment}
                >
                    {t("manage.realm.danger-zone.change-path.button")}
                </button>
                {errors.pathSegment && <span>
                    {t("manage.realm.danger-zone.change-path.must-not-be-empty")}
                </span>}
            </form>
        </div>
    );
};

