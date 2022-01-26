import { ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { Card } from "./Card";


export const ErrorBox: React.FC = ({ children }) => (
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
    return <ErrorBox>{t("errors.not-authorized-to-view-page")}</ErrorBox>;
};
