import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Root } from "../layout/Root";
import { loadQuery } from "../relay";
import { UploadQuery } from "../query-types/UploadQuery.graphql";
import { UPLOAD_PATH } from "./paths";
import { makeRoute } from "../rauta";


export const UploadRoute = makeRoute<PreloadedQuery<UploadQuery>>({
    path: UPLOAD_PATH,
    queryParams: [],
    prepare: () => loadQuery(query, {}),
    render: queryRef => <Upload queryRef={queryRef} />,
    dispose: prepared => prepared.dispose(),
});

const query = graphql`
    query UploadQuery {
        ... UserData
    }
`;

type Props = {
    queryRef: PreloadedQuery<UploadQuery>;
};

const Upload: React.FC<Props> = ({ queryRef }) => {
    const { t } = useTranslation();
    const result = usePreloadedQuery(query, queryRef);

    return (
        <Root nav={[]} userQuery={result}>
            <div css={{ margin: "0 auto", maxWidth: 600 }}>
                <h1>{t("upload.title")}</h1>
            </div>
        </Root>
    );
};
