import { Trans, useTranslation } from "react-i18next";
import { FiFrown } from "react-icons/fi";

import { Root } from "../layout/Root";
import { Link } from "../router";
import { match } from "../util";
import { CenteredContent } from "../ui";


export const NotFoundRoute = {
    prepare: () => ({
        render: () => <Root nav={[]}><NotFound kind="page" /></Root>,
    }),
};

type Props = {
    kind: "page" | "video";
};

export const NotFound: React.FC<Props> = ({ kind }) => {
    const { t } = useTranslation();

    return <>
        <FiFrown css={{ margin: "0 auto", display: "block", fontSize: 90 }} />
        <h1 css={{ textAlign: "center", margin: "32px 0 48px 0 !important" }}>
            {match(kind, {
                "page": () => t("not-found.page-not-found"),
                "video": () => t("not-found.video-not-found"),
            })}
        </h1>
        <CenteredContent>
            <p css={{ margin: "16px 0" }}>
                {match(kind, {
                    "page": () => t("not-found.page-explanation"),
                    "video": () => t("not-found.video-explanation"),
                })}
                {t("not-found.url-typo")}
            </p>
            <Trans i18nKey="not-found.actions">
                You can try visiting <Link to="/">the homepage</Link> or using
                the search bar to find the page you are looking for.
            </Trans>
        </CenteredContent>
    </>;
};
