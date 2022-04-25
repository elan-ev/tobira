import { ReactNode } from "react";
import { FiFrown } from "react-icons/fi";
import { useTranslation } from "react-i18next";

import { useUser } from "../User";
import { PageTitle } from "../layout/header/ui";
import { CenteredContent } from ".";
import { Card } from "./Card";


export const ErrorBox: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ marginTop: 8 }}>
        <Card kind="error">{children}</Card>
    </div>
);

/**
 * If the given error is not `null` nor `undefined`, returns an `<ErrorBox>`
 * with it as content. Returns `null` otherwise.
 */
export const boxError = (err: ReactNode): JSX.Element | null => (
    err == null ? null : <ErrorBox>{err}</ErrorBox>
);

export const NotAuthorized: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    return <ErrorBox>
        {t("errors.not-authorized-to-view-page")}
        {user === "none" && " " + t("errors.might-need-to-login")}
    </ErrorBox>;
};


type ErrorPageProps = {
    title: string;
    children: ReactNode;
};

export const ErrorPage: React.FC<ErrorPageProps> = ({ title, children }) => (
    <>
        <FiFrown css={{ margin: "0 auto", display: "block", fontSize: 90 }} />
        <PageTitle
            title={title}
            css={{ textAlign: "center", margin: "32px 0 48px 0 !important" }}
        />
        <CenteredContent>
            {children}
        </CenteredContent>
    </>
);
