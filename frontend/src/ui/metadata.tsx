import { ReactNode, forwardRef } from "react";
import { useTranslation } from "react-i18next";
import { ellipsisOverflowCss } from ".";
import { COLORS, useColorScheme } from "../color";


export const TitleLabel: React.FC<{ htmlFor: string }> = ({ htmlFor }) => {
    const { t } = useTranslation();
    return (
        <label htmlFor={htmlFor}>
            {t("upload.metadata.title")}
            <FieldIsRequiredNote />
        </label>
    );
};

export const FieldIsRequiredNote: React.FC = () => {
    const { t } = useTranslation();

    return <span css={{ fontWeight: "normal" }}>
        {" ("}
        <em>{t("upload.metadata.required")}</em>
        {")"}
    </span>;
};

/** Separates different inputs in the metadata form */
export const InputContainer: React.FC<{ children: ReactNode }> = ({ children }) => (
    <div css={{ margin: "16px 0 " }}>{children}</div>
);

type SmallDescriptionProps = {
    text: string | null;
    lines?: number;
    className?: string;
};

/**
 * An event's or series' description in at most `lines` lines. The text is not
 * transformed at all, but emitted as is.
 */
export const SmallDescription: React.FC<SmallDescriptionProps> = ({
    text,
    className,
    lines = 2,
}) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const sharedStyle = {
        fontSize: 13,
        marginTop: 4,
        color: COLORS.neutral60,
    };

    if (text === null) {
        return <div {...{ className }} css={{
            ...sharedStyle,
            fontStyle: "italic",
            color: isDark ? COLORS.neutral60 : COLORS.neutral50,
        }}>{t("manage.my-videos.no-description")}</div>;
    } else {
        return <div {...{ className }} css={{
            ...sharedStyle,
            maxWidth: 800,
            color: isDark ? COLORS.neutral70 : COLORS.neutral60,
            ...ellipsisOverflowCss(lines),
        }}>{text}</div>;
    }
};


type DescriptionProps = {
    text: string | null;
    className?: string;
};

/**
 * Display an event's or series' description. The text is transformed slightly
 * into proper paragraphs.
 */
export const Description = forwardRef<HTMLDivElement, DescriptionProps>(
    ({ text, className }, ref) => {
        const { t } = useTranslation();

        const stripped = text?.trim();
        if (!stripped) {
            return <div {...{ className }} css={{ fontStyle: "italic" }}>
                {t("manage.my-videos.no-description")}
            </div>;
        }

        // We split the whole description by empty lines (two or more consecutive
        // newlines). That's the typical "make paragraphs from text" algorithm also
        // used by Markdown. However, we capture those newlines to be able to
        // output any extra (in addition to two) newlines. If a user typed many
        // newlines in their description, they probably want to have more space
        // there. The newlines between and within the paragraphs are then displayed
        // via `white-space: pre-line` below.
        const paragraphs = stripped.split(/(\n{2,})/);

        // TODO: auto link URL-like things?
        return (
            <div ref ={ref} {...{ className }} css={{
                lineHeight: "1.43em",
                whiteSpace: "pre-line",
                "& > p:not(:first-child)": {
                    marginTop: 8,
                },
            }}>
                {paragraphs.map((s, i) => i % 2 === 0
                    ? <p key={i}>{s}</p>
                    : s.slice(2))}
            </div>
        );
    },
);
