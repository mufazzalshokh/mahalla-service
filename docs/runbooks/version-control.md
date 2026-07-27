# Version control and checkpoint publishing

The canonical repository is
`https://github.com/mufazzalshokh/mahalla-service.git`, using the `main` branch.

## Checkpoint publication policy

1. Keep partial or failing checkpoint work local while it is being developed.
2. After a checkpoint passes its required gates and receives stakeholder approval,
   review the change set for secrets and unintended files.
3. Create a checkpoint-scoped commit, push `main` to `origin`, and verify that the
   remote commit SHA matches the local commit SHA.
4. If a commit or push fails, stop the next checkpoint and report the failure.

Never force-push, rewrite published history, or destructively reset the repository
without explicit stakeholder approval.

The initial repository publication contains the approved CP-00 through CP-05
baseline because those checkpoints predate the GitHub repository connection.
