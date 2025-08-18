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
import { COLORS } from "../../../../../../color";
import { RenderMarkdown } from "../../../../../../ui/Blocks/Text";


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
        <FormattingGuide />
        <Controller
            name="content"
            defaultValue={content}
            render={({ field }) => <TextArea
                placeholder={t("manage.block.text.placeholder")}
                css={{ display: "block" }}
                {...field}
            />}
        />
    </EditModeForm>;
};

const FormattingGuide: React.FC = () => {
    const { t } = useTranslation();

    const rows: [string, string][] = [
        [
            t("manage.block.text.formatting.bold"),
            "The **lazy** dog",
        ],
        [
            t("manage.block.text.formatting.italic"),
            "The *lazy* dog",
        ],
        [
            t("manage.block.text.formatting.link"),
            "[Lazy dog](https://example.com)",
        ],
        [
            t("manage.block.text.formatting.bullet-points"),
            "- Lazy dog\n- Quick brown fox",
        ],
        [
            t("manage.block.text.formatting.ordered-list"),
            "1. Lazy dog\n2. Quick brown fox",
        ],
        [
            t("manage.block.text.formatting.external-image"),
            "![Alt text](https://example.com/image.jpg)",
        ],
        [
            t("manage.block.text.formatting.quote"),
            "> To 🐝 or not to 🐝. ― Shakespeare",
        ],
        [
            t("manage.block.text.formatting.hr"),
            "---",
        ],
        [
            t("manage.block.text.formatting.monospace"),
            "E-Mail: `test@example.com`",
        ],
        [
            t("manage.block.text.formatting.code-block"),
            "```\nfn main() {}\n```",
        ],
    ];

    return (
        <details css={{
            border: `1px solid ${COLORS.neutral40}`,
            borderRadius: 4,
            padding: "6px 8px",
            margin: "16px 0",
            fontSize: 14,
            code: {
                backgroundColor: COLORS.neutral15,
                borderRadius: 4,
                padding: 2,
            },
        }}>
            <summary css={{ cursor: "pointer", fontWeight: "bold" }}>
                {t("manage.block.text.formatting.guide")}
            </summary>
            <p css={{ margin: "16px 8px", maxWidth: "80ch" }}>
                {t("manage.block.text.formatting.description")}
            </p>
            <div css={{ overflowX: "auto" }}>
                <table css={{
                    width: "100%",
                    maxWidth: 930,
                    borderCollapse: "collapse",
                    "> thead > tr, > tbody > tr:not(:last-child)": {
                        borderBottom: `1px solid ${COLORS.neutral15}`,
                    },
                    th: {
                        textAlign: "left",
                    },
                    "th, td": {
                        padding: "8px 12px",
                    },
                }}>
                    <thead>
                        <tr>
                            <th></th>
                            <th>Markdown</th>
                            <th>{t("manage.block.text.formatting.result")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(([label, markdown], i) => <tr key={i}>
                            <td css={{ fontWeight: "bold" }}>{label}</td>
                            <td css={{
                                fontFamily: "monospace",
                                whiteSpace: "pre-line",
                            }}>{markdown}</td>
                            <td css={{
                                "& > *": {
                                    margin: 0,
                                },
                                "img": {
                                    height: 30,
                                },
                            }}>
                                <RenderMarkdown>
                                    {markdown.replace(
                                        "https://example.com/image.jpg",
                                        "/~assets/favicon.svg",
                                    )}
                                </RenderMarkdown>
                            </td>
                        </tr>)}
                    </tbody>
                </table>
            </div>
        </details>

    );
};
