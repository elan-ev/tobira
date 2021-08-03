import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import type { GeneralRealmData$key } from "../../../query-types/GeneralRealmData.graphql";
import { useForm } from "react-hook-form";
import { Input } from "../../../ui/Input";
import { Card } from "../../../ui/Card";
import { Button } from "../../../ui/Button";
import { Spinner } from "../../../ui/Spinner";


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
    const { register, handleSubmit, watch, setError, formState: { errors } } = useForm<FormData>({
        mode: "onChange",
    });
    const [commit, isInFlight] = useMutation(renameMutation);

    const onSubmit = handleSubmit(data => {
        commit({
            variables: {
                id: realm.id,
                set: {
                    name: data.name,
                },
            },
            onError: error => {
                console.error(error);
                setError("name", {
                    type: "manual",
                    message: t("manage.realm.general.generic-network-error"),
                });
            },
        });
    });

    const validation = {
        required: t("manage.realm.general.name-must-not-be-empty"),
    };

    return (
        <form onSubmit={onSubmit} css={{ margin: "32px 0" }}>
            <label
                htmlFor="id-field"
                css={{ fontWeight: "bold", display: "block", marginBottom: 8 }}
            >{t("manage.realm.general.rename-label")}</label>
            <div css={{ marginBottom: 16, display: "flex", alignItems: "center" }}>
                <Input
                    id="rename-field"
                    defaultValue={realm.name}
                    css={{ marginRight: 16 }}
                    error={!!errors.name}
                    {...register("name", validation)}
                />
                <Button
                    type="submit"
                    disabled={isInFlight || watch("name", realm.name) === realm.name}
                >{t("rename")}</Button>
                {isInFlight && <Spinner size={20} css={{ marginLeft: 16 }} />}
            </div>
            {errors.name && <Card kind="error">{errors.name.message}</Card>}
        </form>
    );
};
