import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { useUser } from "../User";
import { useTitle } from "../util";
import { Card, ErrorBox } from "@opencast/appkit";

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
    children?: ReactNode;
};

/** Simple error page showing a red box. Additional information can be passed as `children`. */
export const ErrorPage: React.FC<ErrorPageProps> = ({ title, children }) => {
    useTitle(`Error: ${title}`);

    return (
        <div css={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <Card kind="error" iconPos="top" css={{ fontSize: 18, marginBottom: 48 }}>
                {title}
            </Card>
            <div css={{ maxWidth: 700 }}>
                {children}
            </div>
        </div>
    );
};
