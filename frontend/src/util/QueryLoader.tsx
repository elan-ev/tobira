import { JSX } from "react";
import { GraphQLTaggedNode, PreloadedQuery, usePreloadedQuery } from "react-relay";
import { OperationType } from "relay-runtime";


type Props<TQuery extends OperationType> = {
    query: GraphQLTaggedNode;
    queryRef: PreloadedQuery<TQuery>;
    render: (result: TQuery["response"]) => JSX.Element;
};

/**
 * Utility component that loads a query for you.
 *
 * On many routes, the query has to be loaded, the results are inspected and
 * depending on the results, the main page or an error page (e.g. "not found")
 * is shown. Because you cannot use hooks conditionally nor in the route's
 * `render` function, this often leads to extra `DispatchFoo` components that
 * clutter the code. This is where this utility comes in.
 */
export const QueryLoader = <TQuery extends OperationType>(
    { query, queryRef, render }: Props<TQuery>,
): JSX.Element => {
    const queryResult = usePreloadedQuery(query, queryRef);
    return render(queryResult);
};
