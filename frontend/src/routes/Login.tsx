import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Outer } from "../layout/Root";
import { loadQuery } from "../relay";
import { Link } from "../router";
import { LoginQuery } from "../query-types/LoginQuery.graphql";
import { Footer } from "../layout/Footer";
import { Logo } from "../layout/header/Logo";
import { BASE_LOGO_MARGIN } from "../layout/header/ui";
import { useForm } from "react-hook-form";
import { Button } from "../ui/Button";
import { boxError } from "../ui/error";
import { match, translatedConfig, useTitle } from "../util";
import { Spinner } from "../ui/Spinner";
import { FiCheck, FiChevronLeft } from "react-icons/fi";
import { Card } from "../ui/Card";
import CONFIG from "../config";
import { LOGIN_PATH } from "./paths";
import { makeRoute } from "../rauta";


export const LoginRoute = makeRoute<PreloadedQuery<LoginQuery>>({
    path: LOGIN_PATH,
    prepare: () => loadQuery(query, {}),
    render: queryRef => <Login queryRef={queryRef} />,
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
    const { t } = useTranslation();
    const { currentUser } = usePreloadedQuery(query, queryRef);
    useTitle(t("user.login"));

    return <Outer>
        <div css={{
            height: "calc(1.5 * var(--outer-header-height))",
            padding: `calc(1.5 * ${BASE_LOGO_MARGIN}) 0`,
            textAlign: "center",
        }}><Logo /></div>

        <main css={{
            margin: "0 auto",
            padding: 16,
            maxWidth: "100%",
            flexGrow: 1,
            display: "flex",
            flexDirection: "column",
        }}>
            {currentUser !== null
                ? <AlreadyLoggedIn displayName={currentUser.displayName} />
                : <>
                    <h1>{t("user.login")}</h1>
                    <LoginBox />
                    <div css={{ marginTop: 12, fontSize: 14, lineHeight: 1 }}>
                        <BackButton />
                    </div>
                </>
            }
        </main>

        <Footer />
    </Outer>;
};

const BackButton: React.FC = () => {
    const { t } = useTranslation();
    const inner = <><FiChevronLeft />{t("back")}</>;
    const css = {
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        gap: 4,
    };

    return history.length === 1
        ? <Link css={css} to="/">{inner}</Link>
        : <a css={css} onClick={() => history.back()}>{inner}</a>;
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

    const validation = { required: t<string>("this-field-is-required") };

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
            window.location.href = "/";
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
            padding: 24,
            border: "1px solid var(--grey80)",
            borderRadius: 4,
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

                <Button
                    kind="happy"
                    type="submit"
                    disabled={state === "pending"}
                    extraCss={{ padding: "6px 16px" }}
                >
                    {t("user.login")}
                    {match(state, {
                        "idle": () => null,
                        "pending": () => <Spinner size={20} />,
                        "success": () => <FiCheck />,
                    })}
                </Button>

                {loginError && <div><Card kind="error" iconPos="top">{loginError}</Card></div>}
            </form>
        </div>
    );
};


type FieldProps = {
    isEmpty: boolean;
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
                    outline: "none",
                    boxShadow: "0 0 0 1px var(--accent-color)",
                    borderColor: "var(--accent-color)",
                },
            },
        }}>{children}</div>
    );
};

type AlreadyLoggedInProps = {
    displayName: string;
};

/**
 * Shown if a logged-in user somehow ends up on the login page. We could also
 * automatically redirect, but that could always backfire. While this is not
 * optimal or particularly nice, it is surely functional.
 */
const AlreadyLoggedIn: React.FC<AlreadyLoggedInProps> = ({ displayName }) => {
    const { t } = useTranslation();

    return <div>
        {t("login-page.already-logged-in", { name: displayName })}
        {" "}
        <Link to="/">{t("login-page.go-to-homepage")}</Link>
    </div>;
};
