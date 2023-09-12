import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useState } from "react";
import { bug, match } from "@opencast/appkit";

import type {
    GeneralRealmData$data,
    GeneralRealmData$key,
} from "./__generated__/GeneralRealmData.graphql";
import { useForm } from "react-hook-form";
import { Input, Select } from "../../../ui/Input";
import { Card } from "../../../ui/Card";
import { Button } from "../../../ui/Button";
import { Spinner } from "../../../ui/Spinner";
import { Form } from "../../../ui/Form";
import { boxError } from "../../../ui/error";
import { displayCommitError } from "./util";
import { COLORS } from "../../../color";


const fragment = graphql`
    fragment GeneralRealmData on Realm {
        id
        name
        nameSource {
            __typename
            ... on PlainRealmName { name }
            ... on RealmNameFromBlock {
                block { id }
            }
        }
        blocks {
            id
            ... on VideoBlock {
                event {
                    ...on AuthorizedEvent { title }
                }
            }
            ... on SeriesBlock {
                series {
                    title
                }
            }
        }
        isMainRoot
    }
`;


// We request the exact same data as in the query so that relay can update all
// internal data and everything is up to date.
const renameMutation = graphql`
    mutation GeneralRealmRenameMutation($id: ID!, $name: UpdatedRealmName!) {
        renameRealm(id: $id, name: $name) {
            ... GeneralRealmData
        }
    }
`;


type Props = {
    fragRef: GeneralRealmData$key;
};

export const General: React.FC<Props> = ({ fragRef }) => {
    const { t } = useTranslation();
    const realm = useFragment(fragment, fragRef);

    // We do not allow changing the name of the root realm.
    if (realm.isMainRoot) {
        return <p>{t("manage.realm.general.no-rename-root")}</p>;
    }

    const { nameSource, ...rest } = realm;
    if (nameSource === null) {
        return bug("name source is null for non-root realm");
    }

    return <NameForm realm={{ nameSource, ...rest }} />;
};

type NameFormProps = {
    realm: GeneralRealmData$data & {
        nameSource: NonNullable<GeneralRealmData$data["nameSource"]>;
    };
};

export const NameForm: React.FC<NameFormProps> = ({ realm }) => {
    type FormData = {
        name: string | null;
        block: string | null;
        nameSource: "plain-name" | "name-from-block";
    };

    const initial = {
        name: realm.nameSource.__typename === "PlainRealmName"
            ? realm.name
            : null,
        block: realm.nameSource.__typename === "RealmNameFromBlock"
            // TODO: this breaks when we add new block types
            ? realm.nameSource.block.id ?? null
            : null,
        nameSource: realm.nameSource.__typename === "PlainRealmName"
            ? "plain-name"
            : "name-from-block",
    } as const;

    const { t } = useTranslation();
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>({
        mode: "onChange",
        defaultValues: initial,
    });

    const [commitError, setCommitError] = useState<JSX.Element | null>(null);
    const [commit, isInFlight] = useMutation(renameMutation);

    const onSubmit = handleSubmit(data => {
        commit({
            variables: {
                id: realm.id,
                name: {
                    plain: data.nameSource === "plain-name" ? data.name : null,
                    block: data.nameSource === "name-from-block" ? data.block : null,
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


    const name = watch("name");
    const block = watch("block");
    const nameSource = watch("nameSource");
    const isPlain = nameSource === "plain-name";
    const canSave = match(nameSource, {
        "name-from-block": () => block != null && block !== initial.block,
        "plain-name": () => !!name && name !== initial.name,
    });

    const suitableBlocks = realm.blocks
        .map(block => {
            // We simply don't show events/series that cannot be accessed, are
            // still pending, or are deleted.
            let label;
            if (block.event?.title != null) {
                label = t("video.video") + ": " + block.event.title;
            } else if (block.series?.title != null) {
                label = t("series.series") + ": " + block.series.title;
            } else {
                return null;
            }

            return { id: block.id, label };
        })
        .filter(<T, >(b: T | null): b is T => b != null);

    return <>
        <h2 css={{ marginTop: 48 }}>{t("manage.realm.general.page-name")}</h2>
        <Form onSubmit={onSubmit} css={{ marginBottom: 32 }}>
            <div
                css={{
                    marginBottom: 16,
                    border: `1px solid ${COLORS.neutral25}`,
                    borderRadius: 4,
                    "& > div": {
                        "&:not(:first-child)": {
                            borderTop: `1px solid ${COLORS.neutral25}`,
                        },
                        "& > label": {
                            padding: 12,
                            margin: 0,
                            display: "flex",
                            gap: 16,
                            alignItems: "center",
                            cursor: "pointer",
                            "& > input[type=radio]": {
                                width: 16,
                                height: 16,
                                margin: 0,
                            },
                        },
                        "& > div": {
                            padding: `0 12px 12px ${12 + 16 + 16}px`,
                        },
                    },
                }}
            >
                <div>
                    <label>
                        <input type="radio" value="plain-name" {...register("nameSource")} />
                        <div>
                            {t("manage.realm.general.name-directly")}
                            <div css={{ fontWeight: "normal", fontSize: 14 }}>
                                {t("manage.realm.general.name-directly-description")}
                            </div>
                        </div>
                    </label>
                    {isPlain && <div>
                        <Input
                            id="rename-field"
                            defaultValue={realm.name ?? ""}
                            error={!!errors.name}
                            css={{ width: 500, maxWidth: "100%" }}
                            {...register("name", validation)}
                        />
                        {errors.name && <div css={{ marginTop: 8 }}>
                            <Card kind="error">{errors.name.message}</Card>
                        </div>}
                    </div>}
                </div>

                <div>
                    <label>
                        <input type="radio" value="name-from-block" {...register("nameSource")} />
                        <div>
                            {t("manage.realm.general.name-from-block")}
                            <div css={{ fontWeight: "normal", fontSize: 14 }}>
                                {t("manage.realm.general.name-from-block-description")}
                            </div>
                        </div>
                    </label>
                    {!isPlain && <div>
                        {suitableBlocks.length === 0 && <div>
                            <Card kind="error">{t("manage.realm.general.no-blocks")}</Card>
                        </div>}
                        {suitableBlocks.length > 0 && <Select
                            css={{ width: 500, maxWidth: "100%" }}
                            error={"event" in errors}
                            defaultValue={initial.block ?? undefined}
                            {...register("block")}
                        >
                            {suitableBlocks.map(({ id, label }) => (
                                <option key={id} value={id}>{label}</option>
                            ))}
                        </Select>}
                    </div>}
                </div>
            </div>

            <div css={{ display: "flex", alignItems: "center" }}>
                <Button type="submit"disabled={isInFlight || !canSave}>
                    {t("general.action.save")}
                </Button>
                {isInFlight && <Spinner size={20} css={{ marginLeft: 16 }} />}
            </div>

            {boxError(commitError)}
        </Form>
    </>;
};
