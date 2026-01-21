import React from "react";
import { graphql, useFragment } from "react-relay";

import { Title } from "..";
import { TitleBlockData$key } from "./__generated__/TitleBlockData.graphql";
import { TEXT_MAX_WIDTH } from ".";


const fragment = graphql`
    fragment TitleBlockData on TitleBlock {
        content
    }
`;

type Props = {
    fragRef: TitleBlockData$key;
};

export const TitleBlock: React.FC<Props> = ({ fragRef }) => {
    const { content } = useFragment(fragment, fragRef);
    // Normally, there is a gap between any two blocks.
    // We don't want that for titles, though.
    // They are supposed to be closer to whatever they are titling.
    return <Title title={content} css={{ marginBottom: -16, maxWidth: TEXT_MAX_WIDTH }} />;
};
