# Production deployment and rollback

This runbook prepares the first paid pilot. It does not authorize accepting real resident data. The
privacy, retention, service-policy and named-operator checklist must also be approved.

## Recommended zero-budget sequence

1. Sell and demonstrate with synthetic data on the current machine.
2. Include a small dedicated Linux VPS and backup destination in the customer's pilot price.
3. Provision the VPS only after payment/contract approval. The starting capacity assumption is 2
   vCPU, 2 GB RAM and 40 GB persistent storage; measure before increasing it.
4. Keep all inbound application ports closed. Permit restricted administrative SSH only; the bot uses
   outbound HTTPS long polling.

## Host preparation

- Install a supported Linux distribution, Docker Engine, Docker Compose v2, Git, GnuPG, curl and
  Node.js/pnpm for validation/build tooling.
- Enable the Docker service at boot, automatic security updates and host time synchronization.
- Create a dedicated non-root deployment operator. Restrict SSH by key and source address where
  practical; disable password/root login.
- Clone this repository to `/opt/mahalla-service/app`. Do not store unrelated data there.
- Copy `deploy/production.env.example` to `/opt/mahalla-service/config/production.env`, mode `600`.
- Create the secret files described in `deploy/secrets/README.md` outside the checkout.
- Pull the approved Node and PostgreSQL tags, inspect their `RepoDigests`, and put the immutable
  `name@sha256:...` values in the production environment file.

## Release procedure

1. Select a tested Git commit; do not deploy an uncommitted working tree or a branch name.
2. Put its full 40-character SHA in `MCK_RELEASE`.
3. Set the named MCK owner, encrypted off-host destination, loopback health port and digest-pinned
   images. Keep all secrets in files.
4. Run:

```bash
cd /opt/mahalla-service/app
git fetch --tags origin
git checkout --detach FULL_APPROVED_COMMIT_SHA
bash scripts/deploy-production.sh /opt/mahalla-service/config/production.env
```

The script installs the lockfile exactly, runs quality/build/configuration checks, refuses a dirty or
mismatched release, validates Compose, takes an encrypted pre-deploy backup when a database is
already running, runs forward migrations before the app, and verifies health/readiness/metrics and
the exact release ID.

## Rollback

Application rollback is permitted only to a release documented as compatible with the current
additive schema.

1. Stop new operational work and record the reason/decision owner.
2. Preserve logs and take another encrypted backup; never delete audit or migration records.
3. Check out the last known-good compatible commit in detached mode.
4. Set `MCK_RELEASE` to that full SHA and run the same deployment script.
5. Run the smoke test and a synthetic resident/staff lifecycle.

If a migration damaged data or is incompatible, stop writes. Restore the verified pre-migration
backup into a separate database, validate it, then switch through an approved recovery procedure.
Never edit the Drizzle journal or drop production tables as a shortcut.

## Scheduled operations

Use the host scheduler with absolute paths and capture exit status:

```cron
* * * * * cd /opt/mahalla-service/app && bash scripts/monitor-production.sh /opt/mahalla-service/config/production.env
15 2 * * * cd /opt/mahalla-service/app && bash scripts/backup-production.sh /opt/mahalla-service/config/production.env
```

The backup script creates an encrypted artifact and checksum but deliberately does not invent an
off-host provider. The named operator must copy it to the configured buyer-controlled destination and
verify access. Rehearse an isolated restore monthly and before high-risk changes.
