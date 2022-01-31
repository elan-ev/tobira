import React, { useImperativeHandle } from "react";
import { useTranslation } from "react-i18next";
import { graphql, useFragment, useMutation } from "react-relay";
import { useFormContext } from "react-hook-form";

import type {
    TextEditModeBlockData$key,
} from "./__generated__/TextEditModeBlockData.graphql";
import type {
    TextEditCreateMutation,
} from "./__generated__/TextEditCreateMutation.graphql";
import type {
    TextEditSaveMutation,
} from "./__generated__/TextEditSaveMutation.graphql";
import { bug } from "../../../../../../util/err";
import type { EditModeRef, EditModeFormData } from ".";
import { TextArea } from "../../../../../../ui/Input";


export type TextFormData = {
    content: string;
};

type EditTextBlockProps = {
    block: TextEditModeBlockData$key;
};

export const EditTextBlock = React.forwardRef<EditModeRef, EditTextBlockProps>(
    ({ block: blockRef }, ref) => {
        const { t } = useTranslation();


        const { content } = useFragment(graphql`
            fragment TextEditModeBlockData on TextBlock {
                content
            }
        `, blockRef);


        const form = useFormContext<EditModeFormData>();


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

        useImperativeHandle(ref, () => ({
            save: (id, data, onCompleted, onError) => {
                const { type: _type, ...set } = data.type === "TextBlock"
                    ? data
                    : bug("not a text block");

                save({
                    variables: { id, set },
                    onCompleted,
                    onError,
                });
            },
            create: (realm, index, data, onCompleted, onError) => {
                const { type: _type, ...block } = data.type === "TextBlock"
                    ? data
                    : bug("not a text block");

                create({
                    variables: { realm, index, block },
                    onCompleted,
                    onError,
                });
            },
        }));


        return <TextArea
            placeholder={t("manage.realm.content.text.content")}
            defaultValue={content}
            {...form.register("content")}
        />;
    },
);
