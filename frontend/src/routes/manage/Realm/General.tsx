import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import type { GeneralRealmData$key } from "../../../query-types/GeneralRealmData.graphql";
import { useForm } from "react-hook-form";
import { Input } from "../../../ui/Input";
import { Card } from "../../../ui/Card";
import { Button } from "../../../ui/Button";
import { Spinner } from "../../../ui/Spinner";
import { Form } from "../../../ui/Form";
import { boxError, displayCommitError } from "./util";
import { useState } from "react";


const fragment = graphql`
    fragment GeneralRealmData on Realm {
        id
        name
        isRoot
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

    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [commit, isInFlight] = useMutation(renameMutation);

    const onSubmit = handleSubmit(data => {
        commit({
            variables: {
                id: realm.id,
                set: {
                    name: data.name,
                },
            },
            onError: e => {
                setCommitError(displayCommitError(e, t("manage.realm.general.rename-failed")));
            },
        });
    });

    const validation = {
        required: t("manage.realm.name-must-not-be-empty"),
    };

    // We do not allow changing the name of the root realm.
    if (realm.isRoot) {
        return <p>{t("manage.realm.general.no-rename-root")}</p>;
    }

    return (
        <Form onSubmit={onSubmit} css={{ margin: "32px 0" }}>
            <label htmlFor="rename-field">{t("manage.realm.general.rename-label")}</label>
            <div css={{
                display: "flex",
                marginBottom: 16,
                gap: 16,
                alignItems: "center",
                flexWrap: "wrap",
            }}>
                <Input
                    id="rename-field"
                    defaultValue={realm.name}
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
            {boxError(commitError)}
        </Form>
    );
};
