import React, { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useFormContext } from "react-hook-form";


export const Heading: React.FC<{ children: ReactNode }> = ({ children }) => <h3 css={{
    marginTop: 8,
    marginBottom: 4,
}}>
    {children}
</h3>;

type ShowTitleProps = {
    showTitle: boolean;
};

export const ShowTitle: React.FC<ShowTitleProps> = ({ showTitle }) => {
    const { t } = useTranslation();
    const { register } = useFormContext<ShowTitleProps>();

    return <>
        <Heading>{t("manage.realm.content.titled.title")}</Heading>
        <label>
            <input type="checkbox" defaultChecked={showTitle} {...register("showTitle")} />
            {t("manage.realm.content.titled.show-title")}
        </label>
    </>;
};
