import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useFormContext } from "react-hook-form";

import { TextArea } from "../../../../../../ui/Input";
import { EditModeForm } from ".";
import type {
    TextEditModeBlockData$key,
} from "./__generated__/TextEditModeBlockData.graphql";
import type {
    TextEditCreateMutation,
} from "./__generated__/TextEditCreateMutation.graphql";
import type {
    TextEditSaveMutation,
} from "./__generated__/TextEditSaveMutation.graphql";


type TextFormData = {
    content: string;
};

type EditTextBlockProps = {
    block: TextEditModeBlockData$key;
};

export const EditTextBlock: React.FC<EditTextBlockProps> = ({ block: blockRef }) => {
    const { t } = useTranslation();


    const { content } = useFragment(graphql`
        fragment TextEditModeBlockData on TextBlock {
            content
        }
    `, blockRef);


    const form = useFormContext<TextFormData>();


    const [save] = useMutation<TextEditSaveMutation>(graphql`
        mutation TextEditSaveMutation($id: ID!, $set: UpdateTextBlock!) {
            updateTextBlock(id: $id, set: $set) {
                ... BlocksBlockData
            }
        }
    `);

    const [create] = useMutation<TextEditCreateMutation>(graphql`
        mutation TextEditCreateMutation($realm: ID!, $index: Int!, $block: NewTextBlock!) {
            addTextBlock(realm: $realm, index: $index, block: $block) {
                ... ContentManageRealmData
            }
        }
    `);


    return <EditModeForm create={create} save={save} map={(data: TextFormData) => data}>
        <TextArea
            placeholder={t("manage.realm.content.text.content")}
            defaultValue={content}
            css={{ display: "block" }}
            {...form.register("content")}
        />
    </EditModeForm>;
};
