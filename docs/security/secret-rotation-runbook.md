# Secret Rotation Runbook

Use this runbook whenever secret scanning finds a committed key or an operator suspects exposure.

## Immediate Response

1. Revoke or rotate the exposed key in the provider console. Treat committed keys as compromised even if the repository is private.
2. Replace the runtime value in the deployment secret store. Do not paste live values into `.env*` files under the repository.
3. Redeploy the affected service and verify the old key no longer works.
4. Record the incident timestamp, provider, affected environment, and rotation owner in the incident tracker.

## Repository Cleanup

1. Remove the secret from code and committed env files. Keep placeholders in examples.
2. Run `gitleaks detect --redact --verbose` and `trufflehog git file://$PWD --only-verified`.
3. If the secret appears in git history, coordinate history rewrite only after the provider-side key has been revoked and all collaborators are notified.
4. Add or update scanning rules for the leaked token shape when default detectors missed it.

## Verification

1. Confirm CI secret scanning passes on the remediation branch.
2. Confirm the affected feature starts with the new secret and fails closed or degrades when the secret is absent.
3. Check logs for accidental emission of the old or new secret.
4. Close the incident only after provider audit logs show no unexpected use after rotation.
