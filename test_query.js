const url = 'https://local.graphql.local.nhost.run/v1';
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

fetch(url, {
  method: 'POST',
  headers: {
    'X-Hasura-Admin-Secret': 'nhost-admin-secret',
    'X-Hasura-Role': 'user',
    'X-Hasura-User-Id': 'ca91e349-ef92-49a7-bb2e-01672c4d7577',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    query: `query GetOrgMembers {
      org_members {
        id role user_id
      }
    }`
  })
})
.then(r => r.json())
.then(d => console.log(JSON.stringify(d, null, 2)))
.catch(e => console.error(e));
