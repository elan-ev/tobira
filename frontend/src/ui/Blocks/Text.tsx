import React from "react";
import { graphql, useFragment } from "react-relay";
import ReactMarkdown from "react-markdown";
import type { Options } from "react-markdown";

import { TextBlockData$key } from "./__generated__/TextBlockData.graphql";
import { COLORS } from "../../color";


const fragment = graphql`
    fragment TextBlockData on TextBlock {
        content
    }
`;

type ByQueryProps = {
    fragRef: TextBlockData$key;
};

export const TextBlockByQuery: React.FC<ByQueryProps> = ({ fragRef }) => {
    const { content } = useFragment(fragment, fragRef);
    return <TextBlock {...{ content }} />;
};

type Props = {
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

const CODE_BACKGROUND_COLOR = COLORS.neutral10;

// We override some components emitted by the Markdown parser to add CSS.
const MARKDOWN_COMPONENTS: Options["components"] = {
    p: ({ node, ...props }) => <p
        css={{
            margin: "16px 0",
            maxWidth: 800,
        }}
        {...props}
    />,
    blockquote: ({ node, ...props }) => <blockquote
        css={{
            borderLeft: `4px solid ${COLORS.neutral25}`,
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

export const TextBlock: React.FC<Props> = ({ content }) => (
    <div css={{
        maxWidth: 1200,
        "& > *:first-of-type": { marginTop: 0 },
        "& > *:last-of-type": { marginBottom: 0 },
    }}>
        <ReactMarkdown allowedElements={ALLOWED_MARKDOWN_TAGS} components={MARKDOWN_COMPONENTS}>
            {content}
        </ReactMarkdown>
    </div>
);
