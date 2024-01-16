import React from "react";
import { useTranslation, Trans } from "react-i18next";
import { graphql } from "react-relay";

import CONFIG from "../config";
import { Nav } from "../layout/Navigation";
import { RootLoader } from "../layout/Root";
import { loadQuery } from "../relay";
import { AboutQuery } from "./__generated__/AboutQuery.graphql";
import { makeRoute } from "../rauta";
import { PageTitle } from "../layout/header/ui";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { COLORS } from "../color";

const PATH = "/~tobira";

export const AboutRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<AboutQuery>(query, {});
        return {
            render: () => <RootLoader
                {...{ query, queryRef }}
                nav={data => <Nav fragRef={data.realm} />}
                render={() => <About />}
            />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query AboutQuery {
        ... UserData
        realm: rootRealm {
            ... NavigationData
        }
    }
`;

const About: React.FC = () => {
    const { t } = useTranslation();
    const version = CONFIG.version;

    return <>
        <Breadcrumbs path={[]} tail={t("about-tobira.title")}/>
        <div css={{ maxWidth: "80ch" }}>
            <PageTitle title={t("about-tobira.title")} />
            <p css={{ margin: "16px 0" }}>
                <Trans i18nKey="about-tobira.body">
                    Description.
                    <a href="https://github.com/elan-ev/tobira">GitHub repo</a>
                </Trans>
            </p>
            <h2>{t("general.version-information")}</h2>
            <a href={`https://github.com/elan-ev/tobira/releases/tag/${version.identifier}`}>
                Tobira <strong>{version.identifier}</strong>
            </a>
            {" "}
            <span css={{ color: COLORS.neutral80, paddingLeft: 8 }}>
                (<code css={{ fontSize: 13 }}>{version.target}</code>)
            </span>
            <br />
            {"Git info: "}
            <a href={`https://github.com/elan-ev/tobira/commit/${version.gitCommitHash}`}>
                <code css={{
                    fontSize: 14,
                    overflowWrap: "anywhere",
                }}>{version.gitCommitHash}</code>
            </a>
            {version.gitWasDirty && ", dirty"}
            <br />
            Built: {version.buildDateUtc}
        </div>
    </>;
};
