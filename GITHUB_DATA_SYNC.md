# GitHub Data Sync

The admin panel now treats the JSON files in `data/` as the source of truth.
After an admin save, the app stages `data/`, commits the JSON change, and pushes
the commit to GitHub. Render can then redeploy from the newest repository data.
If Render does not expose a writable Git checkout at runtime, the app falls back
to the GitHub Contents API using the same token and repo variables.

## Required Render environment variables

Set these in the Render service environment:

```text
GIT_SYNC_ENABLED=true
GIT_SYNC_STRICT=true
GIT_SYNC_BRANCH=main
GITHUB_REPO=your-github-username/your-repo-name
GITHUB_TOKEN=your_github_token
```

`GITHUB_REPOSITORY` also works if your host already provides that name.

The GitHub token needs permission to push to the repository. For a fine-grained
token, allow read/write access to repository contents.

Optional author settings:

```text
GIT_SYNC_AUTHOR_NAME=Carnival Admin
GIT_SYNC_AUTHOR_EMAIL=admin@example.com
```

## How it works

1. An admin action updates one or more files in `data/`.
2. The app runs `git add data`.
3. The app commits with a message like `Update carnival data: scores.json`.
4. The app pushes `HEAD` to `GIT_SYNC_BRANCH`.
5. Render redeploys from GitHub with the latest JSON data.

If the Git commands cannot run in Render, the changed JSON file is committed via
the GitHub API instead.

## Notes

- Uploaded image files are not part of this JSON sync flow. Logo, champion, and
  gallery uploads still write to local `static/images/...` paths.
- If GitHub push fails and `GIT_SYNC_STRICT=true`, the admin request fails so you
  know the data was not made durable.
- If you need to temporarily disable auto-push locally, set:

```text
GIT_SYNC_ENABLED=false
```
