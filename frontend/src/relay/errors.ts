import {
    GraphQLSingularResponse,
    GraphQLResponseWithData,
    GraphQLResponseWithoutData,
} from "relay-runtime";


export class ServerError extends Error {
    public response: Response;

    public constructor(response: Response) {
        super(response.statusText);
        this.name = "ServerEror";
        this.response = response;
    }
}

export class APIError extends Error {
    // Note: This is a kind of misleading name.
    // There could still be a `data` field on this.
    public response: GraphQLResponseWithoutData;

    public constructor(response: GraphQLResponseWithoutData) {
        super();
        this.name = "APIError";
        this.response = response;
    }
}

export const hasErrors = (
    response: GraphQLSingularResponse,
): response is GraphQLResponseWithoutData =>
    (response as GraphQLResponseWithData).errors !== undefined;
