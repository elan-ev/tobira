import React from "react";
import ReactMarkdown from "react-markdown";
import type { TransformOptions } from "react-markdown";

import { Block, Title } from "../Blocks";


type Props = {
    title: string | null;
    content: string;
};

// We don't just want to allow everything, so here we explicitly list what we
// support. Notably missing:
//
// - headings (if we allow them, we need to map `#` to h2 or h3 so that they
//   don't interfere with other headings on the page.)
const ALLOWED_MARKDOWN_TAGS = [
    "p", "blockquote", "pre", "ul", "ol", "li", "a", "em", "strong", "code", "hr", "img",
];

const CODE_BACKGROUND_COLOR = "#f9f9f6";

// We override some components emitted by the Markdown parser to add CSS.
const MARKDOWN_COMPONENTS: TransformOptions["components"] = {
    p: ({ node, ...props }) => <p
        css={{
            margin: "16px 0",
            maxWidth: 800,
        }}
        {...props}
    />,
    blockquote: ({ node, ...props }) => <blockquote
        css={{
            borderLeft: "4px solid #e5e5e5",
            padding: "2px 8px",
            "& > *:first-child": { marginTop: 0 },
            "& > *:last-child": { marginBottom: 0 },
        }}
        {...props}
    />,
    code: ({ node, className, inline, ...props }) => <code
        css={inline === true && {
            backgroundColor: CODE_BACKGROUND_COLOR,
            padding: "1px 3px",
            borderRadius: "4px",
        }}
        {...props}
    />,
    pre: ({ node, ...props }) => <pre
        css={{
            backgroundColor: CODE_BACKGROUND_COLOR,
            padding: "8px",
            overflowX: "auto",
            maxWidth: "100%",
        }}
        {...props}
    />,
    img: ({ node, ...props }) => <img
        css={{
            maxWidth: "100%",
            display: "block",
        }}
        {...props}
    />,
};

export const TextBlock: React.FC<Props> = ({ title, content }) => (
    <Block>
        <Title title={title} />
        <div css={{
            maxWidth: 1200,
            padding: "6px 10px",
            "& > *:first-child": { marginTop: 0 },
            "& > *:last-child": { marginBottom: 0 },
        }}>
            <ReactMarkdown allowedElements={ALLOWED_MARKDOWN_TAGS} components={MARKDOWN_COMPONENTS}>
                {content}
            </ReactMarkdown>
        </div>
    </Block>
);
