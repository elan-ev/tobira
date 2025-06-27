import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { Controller } from "react-hook-form";

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


    const map = (data: TextFormData) => data;
    const defaultValues = { content };


    return <EditModeForm {...{ defaultValues, map, save, create }}>
        <Controller
            name="content"
            defaultValue={content}
            render={({ field }) => <TextArea
                placeholder={t("manage.block.text")}
                css={{ display: "block" }}
                {...field}
            />}
        />
    </EditModeForm>;
};
