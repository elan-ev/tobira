import { Trans, useTranslation } from "react-i18next";
import { FiFrown } from "react-icons/fi";

import { MAIN_PADDING, OUTER_CONTAINER_MARGIN, Root } from "../layout/Root";
import { Header } from "../layout/Header";
import { Link } from "../router";
import type { Route } from "../router";
import { match } from "../util";


export const NotFoundRoute: Route<void> = {
    path: ".*",
    prepare: () => {},
    render: () => <NotFound kind="page" />,
};

type Props = {
    kind: "page" | "video";
};

export const NotFound: React.FC<Props> = ({ kind }) => {
    const { t } = useTranslation();

    return (
        <Root nav={[]}>
            <FiFrown css={{ margin: "0 auto", display: "block", fontSize: 90 }} />
            <h1 css={{ textAlign: "center", margin: "30px 0" }}>
                {match(kind, {
                    "page": () => t("not-found.page-not-found"),
                    "video": () => t("not-found.video-not-found"),
                })}
            </h1>
            <div css={{ maxWidth: 500, margin: "48px auto" }}>
                <p css={{ margin: "16px 0" }}>
                    {match(kind, {
                        "page": () => t("not-found.page-explanation"),
                        "video": () => t("not-found.video-explanation"),
                    })}
                    {t("not-found.url-typo")}
                </p>
                <Trans i18nKey="not-found.actions">
                    foo<Link to="/">bar</Link>
                </Trans>
            </div>
        </Root>
    );
};
