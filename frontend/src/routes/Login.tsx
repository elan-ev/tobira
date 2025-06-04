import React, { PropsWithChildren, ReactNode, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";
import { match, ProtoButton, screenWidthAtMost, useColorScheme } from "@opencast/appkit";

import { Outer } from "../layout/Root";
import { loadQuery } from "../relay";
import { Link } from "../router";
import { LoginQuery } from "./__generated__/LoginQuery.graphql";
import { Footer } from "../layout/Footer";
import { PageTitle } from "../layout/header/ui";
import { useForm } from "react-hook-form";
import { translatedConfig, useNoindexTag } from "../util";
import { Spinner, boxError, Card } from "@opencast/appkit";
import { LuCheck, LuChevronLeft, LuLogIn } from "react-icons/lu";
import CONFIG from "../config";
import { makeRoute } from "../rauta";
import { Header } from "../layout/header";
import { BREAKPOINT_MEDIUM } from "../GlobalStyle";
import { Breadcrumbs } from "../ui/Breadcrumbs";
import { OUTER_CONTAINER_MARGIN } from "../layout";
import { COLORS } from "../color";
import { focusStyle } from "../ui";
import { IconType } from "react-icons";


export const REDIRECT_STORAGE_KEY = "tobira-redirect-after-login";
const PATH = "/~login";

export const LoginRoute = makeRoute({
    url: PATH,
    match: url => {
        if (url.pathname !== PATH) {
            return null;
        }

        const queryRef = loadQuery<LoginQuery>(query, {});
        return {
            render: () => <Login queryRef={queryRef} />,
            dispose: () => queryRef.dispose(),
        };
    },
});

const query = graphql`
    query LoginQuery {
        currentUser { username, displayName }
    }
`;

type Props = {
    queryRef: PreloadedQuery<LoginQuery>;
};

const Login: React.FC<Props> = ({ queryRef }) => {
    useNoindexTag();
    const { t } = useTranslation();
    const { currentUser } = usePreloadedQuery(query, queryRef);
    const isLoggedIn = currentUser !== null;

    return (
        <Outer>
            <Header loginMode />
            <main css={{
                padding: 16,
                flexGrow: 1,
                margin: OUTER_CONTAINER_MARGIN,
            }}>
                <div css={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                }}>
                    <div css={{ alignSelf: "flex-start" }}>
                        <Breadcrumbs path={[]} tail={t("login-page.heading")} />
                    </div>
                    <div css={{ maxWidth: "100%" }}>
                        <PageTitle title={t("login-page.heading")} css={{
                            fontSize: 36,
                            marginTop: 3,
                            textAlign: "center",
                            [screenWidthAtMost(BREAKPOINT_MEDIUM)]: {
                                fontSize: 30,
                            },
                        }}/>
                        {isLoggedIn
                            ? <Card kind="info">{t("login-page.already-logged-in")}</Card>
                            : <LoginBox />}
                        <div css={{ marginTop: 12, fontSize: 14, lineHeight: 1 }}>
                            <BackButton />
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </Outer>
    );
};

const BackButton: React.FC = () => {
    const { t } = useTranslation();

    // This link does `window.history.back()`. If there is nothing to go back
    // to, the call will silently do nothing. In that case, the link is taken,
    // bringing the user to the home page.
    return <Link
        to="/"
        onClick={() => window.history.back()}
        css={{
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: 4,
            borderRadius: 4,
            textDecoration: "none",
        }}
    ><LuChevronLeft />{t("general.action.back")}</Link>;
};

export type FormData = {
    userid: string;
    password: string;
};

export type AuthenticationFormState = "idle" | "pending" | "success";

const LoginBox: React.FC = () => {
    const { t, i18n } = useTranslation();
    const [state, setState] = useState<AuthenticationFormState>("idle");
    const [loginError, setLoginError] = useState<string | null>(null);

    const onSubmit = async (data: FormData) => {
        setState("pending");
        const response = await fetch("/~login", {
            method: "POST",
            body: new URLSearchParams(data),
        });

        if (response.status === 204) {
            // 204 No content is expected on successful login. We assume that
            // the response also set some headers (or some other sticky
            // information) that is used to authorize the user in future
            // requests.
            setState("success");

            // We hard forward to the home page. We do that to invalidate every
            // data that we might have cached. It's probably be possible to
            // wipe the relay cache manually, but I cannot figure it out right
            // now. And well, this way we are sure everything is reloaded.
            const redirectTo = window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? "/";
            window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
            window.location.href = redirectTo;
        } else if (response.status === 403) {
            // 403 Forbidden means the login data was incorrect
            setState("idle");
            setLoginError(t("login-page.bad-credentials"));
        } else {
            // Everything else is unexpected and should not happen.
            setState("idle");
            setLoginError(t("login-page.unexpected-response"));
        }
    };

    return (
        <AuthenticationForm
            {...{ onSubmit, state }}
            error={loginError}
            SubmitIcon={LuLogIn}
            labels={{
                user: CONFIG.auth.userIdLabel
                    ? translatedConfig(CONFIG.auth.userIdLabel, i18n)
                    : t("login-page.user-id"),
                password: CONFIG.auth.passwordLabel
                    ? translatedConfig(CONFIG.auth.passwordLabel, i18n)
                    : t("general.password"),
                submit: t("user.login"),
            }}
        >
            {CONFIG.auth.loginPageNote && (
                <div css={{
                    backgroundColor: COLORS.neutral10,
                    marginBottom: 32,
                    borderRadius: 4,
                    padding: "8px 16px",
                }}>{translatedConfig(CONFIG.auth.loginPageNote, i18n)}</div>
            )}
        </AuthenticationForm>
    );
};

type AuthenticationFormProps = PropsWithChildren & {
    onSubmit: (data: FormData) => Promise<void> | void;
    state: AuthenticationFormState;
    error: string | null;
    className?: string;
    SubmitIcon: IconType;
    labels: {
        user: string;
        password: string;
        submit: string;
    };
}

export const AuthenticationForm: React.FC<AuthenticationFormProps> = ({
    onSubmit,
    state,
    error,
    className,
    SubmitIcon,
    labels,
    children,
}) => {
    const { t } = useTranslation();
    const isDark = useColorScheme().scheme === "dark";
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>();
    const userId = watch("userid", "");
    const password = watch("password", "");
    const userFieldId = useId();
    const passwordFieldId = useId();

    const validation = { required: t("general.form.this-field-is-required") };

    return (
        <div {...{ className }} css={{
            width: 400,
            maxWidth: "100%",
            marginTop: 24,
            padding: 32,
            border: `1px solid ${COLORS.neutral25}`,
            borderRadius: 8,
            ...isDark && { backgroundColor: COLORS.neutral10 },
        }}>
            {children}
            <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                css={{
                    "& > *:not(:last-child)": { marginBottom: 32 },
                    textAlign: "center",
                }}
            >
                <div>
                    <Field isEmpty={userId === ""}>
                        <label htmlFor={userFieldId}>
                            {labels.user}
                        </label>
                        <input
                            id={userFieldId}
                            autoComplete="username email"
                            spellCheck={false}
                            autoCapitalize="none"
                            required
                            autoFocus
                            {...register("userid", validation)}
                        />
                    </Field>
                    {boxError(errors.userid?.message)}
                </div>
                <div>
                    <Field isEmpty={password === ""}>
                        <label htmlFor={passwordFieldId}>
                            {labels.password}
                        </label>
                        <input
                            id={passwordFieldId}
                            type="password"
                            autoComplete="current-password"
                            required
                            {...register("password", validation)}
                        />
                    </Field>
                    {boxError(errors.password?.message)}
                </div>

                <ProtoButton
                    type="submit"
                    disabled={state === "pending"}
                    css={{
                        backgroundColor: COLORS.happy0,
                        borderRadius: 8,
                        color: COLORS.happy0BwInverted,
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        margin: "0 auto",
                        padding: "7px 14px",
                        ":hover, :focus": {
                            backgroundColor: COLORS.happy1,
                            color: COLORS.happy1BwInverted,
                        },
                        ...focusStyle({ offset: 1 }),
                    }}
                >
                    <SubmitIcon size={20} />
                    {labels.submit}
                    {match(state, {
                        "idle": () => null,
                        "pending": () => <Spinner size={20} />,
                        "success": () => <LuCheck />,
                    })}
                </ProtoButton>

                {error && <Card kind="error" iconPos="top">{error}</Card>}
            </form>
        </div>
    );
};


type FieldProps = {
    isEmpty: boolean;
    children: ReactNode;
};

const Field: React.FC<FieldProps> = ({ isEmpty, children }) => {
    const isDark = useColorScheme().scheme === "dark";
    const raisedStyle = {
        top: 0,
        left: 8,
        fontSize: 12,
    };

    return (
        <div css={{
            position: "relative",
            "& > label": {
                position: "absolute",
                top: "50%",
                left: 16,
                color: COLORS.neutral60,
                transform: "translateY(-50%)",
                transition: "top 150ms, left 150ms, font-size 150ms, color 150ms",
                lineHeight: 1,
                borderRadius: 4,
                padding: "0 4px",
                backgroundColor: isDark ? COLORS.neutral10 : COLORS.neutral05,
                pointerEvents: "none",
                "&:valid": {
                    border: "1px solid blue",
                },
                ...!isEmpty && raisedStyle,
            },
            "& > input": {
                display: "block",
                width: "100%",
                height: 50,
                padding: "16px 16px",
                border: `1px solid ${COLORS.neutral25}`,
                borderRadius: 4,
                // The `autofill` thing overrides Firefox's default yellow and
                // uses Chrome's blue instead, which is easier on the eyes.
                // This should work better for most if not all color configurations.
                ":autofill": { background: isDark ? "#2f3644" : "#e7f0fe" },
                ...isDark && { backgroundColor: COLORS.neutral10 },
            },
            "&:focus-within": {
                "& > label": {
                    color: COLORS.primary1,
                    ...isEmpty && raisedStyle,
                },
                "& > input": {
                    borderColor: COLORS.primary0,
                    outline: `1px solid ${COLORS.primary0}`,
                },
            },
        }}>{children}</div>
    );
};
