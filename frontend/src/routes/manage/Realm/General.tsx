import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import type { GeneralRealmData$key } from "../../../query-types/GeneralRealmData.graphql";
import { useForm } from "react-hook-form";


const fragment = graphql`
    fragment GeneralRealmData on Realm {
        id
        name
    }
`;


// We request the exact same data as in the query so that relay can update all
// internal data and everything is up to date.
const renameMutation = graphql`
    mutation GeneralRealmRenameMutation($id: ID!, $set: UpdateRealm!) {
        updateRealm(id: $id, set: $set) {
            ... GeneralRealmData
        }
    }
`;


type Props = {
    fragRef: GeneralRealmData$key;
};

export const General: React.FC<Props> = ({ fragRef }) => {
    type FormData = {
        name: string;
    };

    const { t } = useTranslation();
    const realm = useFragment(fragment, fragRef);
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>();
    const [commit, _isInFlight] = useMutation(renameMutation);

    const onSubmit = handleSubmit(data => {
        commit({
            variables: {
                id: realm.id,
                set: {
                    name: data.name,
                },
            },
        });
    });

    return (
        <form onSubmit={onSubmit} css={{ marginTop: 32, marginBottom: 64 }}>
            <input defaultValue={realm.name} {...register("name", { required: true })} />
            <button type="submit" disabled={watch("name", realm.name) === realm.name}>
                {t("rename")}
            </button>
            {errors.name && <span>{t("manage.realm.general.name-must-not-be-empty")}</span>}
        </form>
    );
};
