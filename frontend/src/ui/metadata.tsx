import { ReactNode } from "react";
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
export const InputContainer: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ margin: "16px 0 " }}>{children}</div>
);

type DescriptionProps = {
    text: string | null;
    lines?: number;
};

export const Description: React.FC<DescriptionProps> = ({ text, lines = 2 }) => {
    const { t } = useTranslation();
    const sharedStyle = {
        fontSize: 13,
        marginTop: 4,
    };

    if (text === null) {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey65)",
            fontStyle: "italic",
        }}>{t("manage.my-videos.no-description")}</div>;
    } else {
        return <div css={{
            ...sharedStyle,
            color: "var(--grey40)",
            maxWidth: 800,
            display: "-webkit-box",
            WebkitBoxOrient: "vertical",
            textOverflow: "ellipsis",
            WebkitLineClamp: lines,
            overflow: "hidden",
        }}>{text}</div>;
    }
};
