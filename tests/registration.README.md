# Registration transaction verification (4A)

Run mocks and optional integration tests:

```powershell
node -r ts-node/register --test tests/registration.test.js
```

Integration tests require `MONGODB_TEST_URI` configured securely in the environment.
The URI must explicitly select the disposable database `cms_registration_test`
on a dedicated test replica set (or sharded cluster). Never point it at production.
Example without credentials: `mongodb://127.0.0.1:27017/cms_registration_test?replicaSet=rs0`.
No URI is inferred from the application configuration. Missing configuration skips
integration tests; passing mocks does not prove MongoDB atomicity.

The integration suite checks topology, collection collation, existing index names
and duplicates before creating test-only unique indexes. It inserts test challenges
and accounts, then removes only their exact IDs. Test indexes remain in that disposable
database. The lost-ack test injects an error after a real commit; it does not simulate
a network partition or validate all driver retry behavior.

## Deployment prerequisites (manual; not performed by the application)

1. Verify deployed MongoDB supports transactions across Accounts and SecurityChallenges.
2. Inspect actual Accounts collection options and `listIndexes`. Current application
   lookups use unchanged string equality, without normalization or explicit collation;
   effective comparison depends on the existing collection/index configuration.
3. Perform an authorized, read-only duplicate audit grouped separately by username
   and email, using the same effective collation. Check missing/null/non-string fields
   and incompatible existing indexes as well. Do not log credential, URI, OTP or
   account data. Resolve any data issues through a separately approved plan.
4. Verify separate full unique indexes `{ username: 1 }` and `{ email: 1 }` on test DB
   with matching comparison rules. Sparse/partial indexes are not equivalent.
5. Only after audit and explicit approval, plan a coordinated production index build
   with write coordination to prevent new duplicates during the audit/build interval.
   No migration or production index creation is included in this change.

No new schema field or schema index is declared. Registration stores the existing
challenge `_id` in its existing `accountId` field and uses it as Account `_id`, inside
the same transaction. Existing unexpired registration challenges also work this way.
Password reset continues to use the original sessionless helper behavior.

Driver `withTransaction` handles labeled transient/unknown commit retries. There is
no application retry loop. After an unresolved unknown commit, majority reads on
primary can confirm this exact account and consumed challenge. A missing result is
not treated as proof of rollback; OTP is never reopened manually.

API success remains `{ "message": "Đăng ký thành công" }`. Invalid OTP is still 400,
conflict 409 and unresolved/internal failure 500 with the existing generic body.
The API has no new outcome field: a 500 is not proof that creation failed. Frontends
must not blindly resubmit registration after it. A used OTP remains invalid on a new
request, even after reconciliation succeeded in the original request.

Do not claim complete cross-challenge duplicate prevention until required unique
indexes are verified in the deployment database. Transactions alone do not enforce
uniqueness across different challenges.
