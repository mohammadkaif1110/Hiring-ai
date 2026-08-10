import { GraphQLClient, gql } from 'graphql-request';

const HASURA_ENDPOINT = process.env.NHOST_GRAPHQL_URL || 'http://localhost:1337/v1/graphql';
const ADMIN_SECRET = process.env.NHOST_ADMIN_SECRET || 'nhost-admin-secret';

/**
 * Admin-authenticated GraphQL client for backend operations.
 * Uses the Hasura admin secret to bypass permissions — only used in serverless functions.
 */
export function getAdminClient(): GraphQLClient {
  return new GraphQLClient(HASURA_ENDPOINT, {
    headers: {
      'x-hasura-admin-secret': ADMIN_SECRET,
    },
  });
}

/**
 * Execute a GraphQL query/mutation as admin.
 */
export async function adminQuery<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const client = getAdminClient();
  return client.request<T>(query, variables);
}

export { gql };
