# Evidence snapshot

Taken 2026-10-16T08:03:48Z (UTC) from https://gitlab.com/gitlab-ai-hackathon/transcend-october-2026/43241733/gasket. This is a **snapshot**, not live data: it shows the project as it was at that
time. Each file is the evidence JSON exactly as GitLab served it for that run (`evidence/<pipeline id>/`), plus
`snapshot.json` (run and job metadata, merge requests and issues, public profiles only).

Finished pipelines that did not change since the previous snapshot are copied from it, after checking each evidence file against the
SHA-256 recorded in that snapshot's index, instead of being requested from GitLab again. Anything else is read from GitLab.

Every run on the exported dashboard has "Verify at source" links to the live GitLab artifact for the same job and file.
Artifacts expire on GitLab (evidence jobs keep them 90 days), so a link can stop working long after this snapshot;
the baked copy here does not expire.

Regenerate: `python -m gasket.cli dashboard snapshot --project-id <id> --project-url <url> --out dashboard/data`.
