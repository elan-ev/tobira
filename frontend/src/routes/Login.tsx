import React from "react";
import { useTranslation } from "react-i18next";
import { graphql, usePreloadedQuery } from "react-relay";
import type { PreloadedQuery } from "react-relay";

import { Outer } from "../layout/Root";
import { loadQuery } from "../relay";
import { Link, Route } from "../router";
import { LoginQuery } from "../query-types/LoginQuery.graphql";
import { Footer } from "../layout/Footer";
import { Logo } from "../layout/header/Logo";
import { BASE_LOGO_MARGIN } from "../layout/header/ui";
import { useForm } from "react-hook-form";
import { Button } from "../ui/Button";
import { boxError } from "../ui/error";
import { useTitle } from "../util";


export const LoginRoute: Route<PreloadedQuery<LoginQuery>> = {
    path: "/~login",
    prepare: () => loadQuery(query, {}),
    render: queryRef => <Login queryRef={queryRef} />,
};

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
                </>
            }
        </main>

        <Footer />
    </Outer>;
};

type FormData = {
    userid: string;
    password: string;
};

const LoginBox: React.FC = () => {
    const { t } = useTranslation();
    const { register, handleSubmit, watch, formState: { errors } } = useForm<FormData>();
    const userid = watch("userid", "");
    const password = watch("password", "");

    const validation = { required: t<string>("this-field-is-required") };

    const onSubmit = (data: FormData) => {
        console.log("data", data);
    };

    return (
        <div css={{
            width: 350,
            maxWidth: "100%",
            padding: 24,
            border: "1px solid var(--grey80)",
            borderRadius: 4,
        }}>
            <form
                onSubmit={handleSubmit(onSubmit)}
                noValidate
                css={{
                    "& > div:not(:last-child)": { marginBottom: 32 },
                    textAlign: "center",
                }}
            >
                <div>
                    <Field isEmpty={userid === ""}>
                        <label htmlFor="userid">{t("login-page.user-id")}</label>
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
                        <label htmlFor="password">{t("login-page.password")}</label>
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

                <Button kind="happy" type="submit" extraCss={{ padding: "6px 16px" }}>
                    {t("user.login")}
                </Button>
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
