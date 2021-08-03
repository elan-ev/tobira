import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import type { GeneralRealmData$key } from "../../../query-types/GeneralRealmData.graphql";
import { useForm } from "react-hook-form";
import { Input } from "../../../ui/Input";
import { Card } from "../../../ui/Card";
import { Button } from "../../../ui/Button";


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
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        mode: "onChange",
    });
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
        <form onSubmit={onSubmit} css={{ margin: "32px 0" }}>
            <div css={{ marginBottom: 16 }}>
                <Input
                    defaultValue={realm.name}
                    css={{ marginRight: 16 }}
                    error={!!errors.name}
                    {...register("name", { required: true })}
                />
                <Button type="submit" disabled={watch("name", realm.name) === realm.name}>
                    {t("rename")}
                </Button>
            </div>
            {errors.name && <Card kind="error">
                {t("manage.realm.general.name-must-not-be-empty")}
            </Card>}
        </form>
    );
};
