import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useFormContext } from "react-hook-form";

import { Input } from "../../../../../../ui/Input";
import { EditModeForm } from ".";
import type {
    TitleEditModeBlockData$key,
} from "./__generated__/TitleEditModeBlockData.graphql";
import type {
    TitleEditCreateMutation,
} from "./__generated__/TitleEditCreateMutation.graphql";
import type {
    TitleEditSaveMutation,
} from "./__generated__/TitleEditSaveMutation.graphql";


type TitleFormData = {
    content: string;
};

type EditTitleBlockProps = {
    block: TitleEditModeBlockData$key;
};

export const EditTitleBlock: React.FC<EditTitleBlockProps> = ({ block: blockRef }) => {
    const { t } = useTranslation();


    const { content } = useFragment(graphql`
        fragment TitleEditModeBlockData on TitleBlock {
            content
        }
    `, blockRef);


    const form = useFormContext<TitleFormData>();


    const [save] = useMutation<TitleEditSaveMutation>(graphql`
        mutation TitleEditSaveMutation($id: ID!, $set: UpdateTitleBlock!) {
            updateTitleBlock(id: $id, set: $set) {
                ... BlocksBlockData
            }
        }
    `);

    const [create] = useMutation<TitleEditCreateMutation>(graphql`
        mutation TitleEditCreateMutation($realm: ID!, $index: Int!, $block: NewTitleBlock!) {
            addTitleBlock(realm: $realm, index: $index, block: $block) {
                ... ContentManageRealmData
            }
        }
    `);


    return <EditModeForm create={create} save={save}>
        <h3><Input
            placeholder={t("manage.realm.content.title.content")}
            defaultValue={content}
            css={{ display: "block" }}
            {...form.register("content")}
        /></h3>
    </EditModeForm>;
};
