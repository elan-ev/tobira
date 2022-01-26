import { useTranslation } from "react-i18next";


export const TitleLabel: React.FC<{ htmlFor: string }> = ({ htmlFor }) => {
    const { t } = useTranslation();
    return (
        <label htmlFor={htmlFor}>
            {t("upload.metadata.title")}
            <span css={{ fontWeight: "normal" }}>
                {" ("}
                <em>{t("upload.metadata.required")}</em>
                {")"}
            </span>
        </label>
    );
};

/** Separates different inputs in the metadata form */
export const InputContainer: React.FC = ({ children }) => (
    <div css={{ margin: "16px 0 " }}>{children}</div>
);
