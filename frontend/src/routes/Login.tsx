import React, { ReactNode, useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Outer } from "../layout/Root";
import { loadQuery } from "../relay";
import { Link, useRouter } from "../router";
import { LoginQuery } from "./__generated__/LoginQuery.graphql";
import { Footer } from "../layout/Footer";
import { PageTitle } from "../layout/header/ui";
import { useForm } from "react-hook-form";
import { ProtoButton } from "../ui/Button";
import { boxError } from "../ui/error";
import { match, translatedConfig, useNoindexTag } from "../util";
import { Spinner } from "../ui/Spinner";
import { FiCheck, FiChevronLeft, FiLogIn } from "react-icons/fi";
import { Card } from "../ui/Card";
import CONFIG from "../config";
import { LOGIN_PATH } from "./paths";
import { makeRoute } from "../rauta";
import { Header } from "../layout/header";
import { BREAKPOINT_MEDIUM } from "../GlobalStyle";


export const REDIRECT_STORAGE_KEY = "tobira-redirect-after-login";

export const LoginRoute = makeRoute(url => {
    if (url.pathname !== LOGIN_PATH) {
        return null;
    }

    const queryRef = loadQuery<LoginQuery>(query, {});
    return {
        render: () => <Login queryRef={queryRef} />,
        dispose: () => queryRef.dispose(),
    };
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
    const router = useRouter();
    const isLoggedIn = currentUser !== null;

    React.useEffect(() => {
        if (isLoggedIn) {
            const redirectTo = window.sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? "/";
            window.sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
            router.goto(redirectTo, true);
        }
    });

    return isLoggedIn
        // Don't render anything when a redirect is triggered.
        ? null
        : <Outer>
            <Header loginMode />
            <main css={{
                margin: "0 auto",
                padding: 16,
                maxWidth: "100%",
                flexGrow: 1,
                display: "flex",
                flexDirection: "column",
            }}>
                <PageTitle title={t("login-page.heading")} css={{
                    fontSize: 36,
                    margin: "0 auto",
                    marginTop: 44,
                    [`@media (max-width: ${BREAKPOINT_MEDIUM}px)`]: {
                        fontSize: 30,
                        marginTop: 20,
                    },
                }}/>
                <LoginBox />
                <div css={{ marginTop: 12, fontSize: 14, lineHeight: 1 }}>
                    <BackButton />
                </div>
            </main>
            <Footer />
        </Outer>;
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
            ":focus": { outline: "2px solid var(--accent-color)" },
        }}
    ><FiChevronLeft />{t("back")}</Link>;
};

type FormData = {
    userid: string;
    password: string;
};

const LoginBox: React.FC = () => {
    const { t, i18n } = useTranslation();
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>();
    const userid = watch("userid", "");
    const password = watch("password", "");

    const validation = { required: t("this-field-is-required") };

    type State = "idle" | "pending" | "success";
    const [state, setState] = useState<State>("idle");
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
        <div css={{
            width: 400,
            maxWidth: "100%",
            marginTop: 24,
            padding: 32,
            border: "1px solid var(--grey80)",
            borderRadius: 8,
        }}>
            {CONFIG.auth.loginPageNote && (
                <div css={{
                    backgroundColor: "var(--grey97)",
                    marginBottom: 32,
                    borderRadius: 4,
                    padding: "8px 16px",
                }}>{translatedConfig(CONFIG.auth.loginPageNote, i18n)}</div>
            )}

            <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                css={{
                    "& > *:not(:last-child)": { marginBottom: 32 },
                    textAlign: "center",
                }}
            >
                <div>
                    <Field isEmpty={userid === ""}>
                        <label htmlFor="userid">
                            {CONFIG.auth.userIdLabel
                                ? translatedConfig(CONFIG.auth.userIdLabel, i18n)
                                : t("login-page.user-id")}
                        </label>
                        <input
                            id="userid"
                            autoComplete="username email"
                            required
                            autoFocus
                            {...register("userid", validation)}
                        />
                    </Field>
                    {boxError(errors.userid?.message)}
                </div>
                <div>
                    <Field isEmpty={password === ""}>
                        <label htmlFor="password">
                            {CONFIG.auth.passwordLabel
                                ? translatedConfig(CONFIG.auth.passwordLabel, i18n)
                                : t("login-page.password")}
                        </label>
                        <input
                            id="password"
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
                        backgroundColor: "var(--nav-color)",
                        borderRadius: 8,
                        color: "var(--nav-color-bw-contrast)",
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        margin: "0 auto",
                        padding: "7px 14px",
                        ":hover, :focus": {
                            backgroundColor: "var(--nav-color-dark)",
                            color: "var(--nav-color-bw-contrast)",
                        },
                        ":focus": {
                            outlineOffset: 1,
                            outline: "2px solid var(--accent-color)",
                        },
                    }}
                >
                    <FiLogIn size={20} />
                    {t("user.login")}
                    {match(state, {
                        "idle": () => null,
                        "pending": () => <Spinner size={20} />,
                        "success": () => <FiCheck />,
                    })}
                </ProtoButton>

                {loginError && <div><Card kind="error" iconPos="top">{loginError}</Card></div>}
            </form>
        </div>
    );
};


type FieldProps = {
    isEmpty: boolean;
    children: ReactNode;
};

const Field: React.FC<FieldProps> = ({ isEmpty, children }) => {
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
                color: "var(--grey40)",
                transform: "translateY(-50%)",
                transition: "top 150ms, left 150ms, font-size 150ms, color 150ms",
                lineHeight: 1,
                borderRadius: 4,
                padding: "0 4px",
                backgroundColor: "white",
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
                border: "1px solid var(--grey80)",
                borderRadius: 4,
            },
            "&:focus-within": {
                "& > label": {
                    color: "var(--accent-color-darker)",
                    ...isEmpty && raisedStyle,
                },
                "& > input": {
                    borderColor: "var(--accent-color)",
                    outline: "1px solid var(--accent-color)",
                },
            },
        }}>{children}</div>
    );
};
