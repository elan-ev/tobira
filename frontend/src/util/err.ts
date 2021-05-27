/**
 * Make sure that the parameter is `never`. This is particularly useful for
 * enum-like types where you want to make sure you handled all cases. For
 * example:
 *
 * ```
 * type Foo = "anna" | "bob";
 * const x = "anna" as Foo;
 *
 * switch x {
 *     case "anna": ...; break;
 *     case "bob": ...; break;
 *     default: assertNever(x);
 * }
 * ```
 *
 * If you add another variant to that type, the switch statement will fail to
 * compile. This is what we want in most cases! That way, we are notified of all
 * places which we might need to change after adding a new variant.
 */
export const assertNever = (_n: never): never =>
    bug("`assertNever` call was reached, that's a soundness hole in the typesystem :(");

/**
 * A custom error type that represents bugs: errors that are not expected and
 * that cannot be handled. They are caused by a bug in our code and not by the
 * "world" (e.g. any input). Use the helper functions below to throw this error.
 */
export class Bug extends Error {
    public constructor(msg: string) {
        super(`${msg} (this is a bug in Tobira)`);
        this.name = "Bug";
    }
}

/** Throws a `Bug` error. Use this function to signal a bug in the code. */
export const bug = (msg: string): never => {
    throw new Bug(msg);
};

/** Like `bug`, but specifically for code paths that should be unreachable. */
export const unreachable = (msg?: string): never => {
    const prefix = "reached unreachable code";
    throw new Bug(msg === undefined ? prefix : `${prefix}: ${msg}`);
};
