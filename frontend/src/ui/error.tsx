import { ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { Card } from "@opencast/appkit";

import { useUser } from "../User";
import { useTitle } from "../util";
import { LoginLink } from "../routes/util";
import { COLORS } from "../color";


export const NotAuthorized: React.FC = () => {
    const { t } = useTranslation();
    const user = useUser();

    return <div css={{ textAlign: "center" }}>
        <Card kind="info" css={{
            backgroundColor: COLORS.neutral20,
            textAlign: "left",
            svg: { color: COLORS.neutral70 },
        }}>
            {t("errors.not-authorized-to-view-page")}
            <div>
                {user === "none" && <Trans i18nKey="errors.might-need-to-login-link">
                    You might need to <LoginLink css={{
                        color: COLORS.primary1,
                        ":hover, :focus": { color: COLORS.primary2 },
                    }} />
                </Trans>}
            </div>
        </Card>
    </div>;
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
