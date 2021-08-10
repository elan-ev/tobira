import React from "react";
import { graphql, useFragment } from "react-relay";
import ReactMarkdown from "react-markdown";
import type { TransformOptions } from "react-markdown";

import { Block, Title } from "../Blocks";
import { TextBlockData$key } from "../../query-types/TextBlockData.graphql";


const fragment = graphql`
    fragment TextBlockData on TextBlock {
        content
    }
`;

type ByQueryProps = {
    title?: string;
    fragRef: TextBlockData$key;
};

export const TextBlockByQuery: React.FC<ByQueryProps> = ({ title, fragRef }) => {
    const { content } = useFragment(fragment, fragRef);
    return <TextBlock {...{ content, title }} />;
};

type Props = {
    title?: string;
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

const CODE_BACKGROUND_COLOR = "var(--grey97)";

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
            borderLeft: "4px solid var(--grey80)",
            padding: "2px 8px",
            "& > *:first-of-type": { marginTop: 0 },
            "& > *:last-of-type": { marginBottom: 0 },
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
            "& > *:first-of-type": { marginTop: 0 },
            "& > *:last-of-type": { marginBottom: 0 },
        }}>
            <ReactMarkdown allowedElements={ALLOWED_MARKDOWN_TAGS} components={MARKDOWN_COMPONENTS}>
                {content}
            </ReactMarkdown>
        </div>
    </Block>
);
