# Guess Five — Computer Guesses

Think of five different digits and give feedback while the computer guesses
your code. With accurate feedback, the included fixed strategy succeeds in at
most **7 guesses** for every one of the **30,240** possible secrets. Leading
zeroes are allowed.

This is the computer-guessing companion to the separate
[Guess Five human-guessing game](https://weijie608.github.io/guess5-web/).
The interface follows the visual design of
[guess4-web](https://github.com/Weijie608/guess4-web), with five-digit rules and
the exact strategy from `BaC5_pub`.

## Play

1. Keep one five-digit secret in your head. Each digit must be different.
2. For each computer guess, select both feedback numbers:
   - **r:** how many digits are in the correct position.
   - **s:** how many digits are shared in total, **including those counted by r**.
3. Submit the feedback. An exact match is **5r 5s**.

For example, secret `01234` and guess `01567` give `2r 2s`.
Your secret is never entered into the page. The game does not send feedback to
a server, use analytics, store game state, or require an account.

The computer may guess a code outside the remaining candidate set. If only one
candidate remains, the round ends immediately and reveals it. No additional
**5r 5s** confirmation is requested. An exact match also ends the round.
The result distinguishes the guesses used to identify the secret from the
success count that would include one final exact guess when needed.
Use **Start over** to begin a new round or correct an earlier accepted answer.
Reloading the page also starts a new round.

## Run locally on Windows

Python is only used to serve static files. Python 3.10+ also runs the optional
exporter. In PowerShell:

```powershell
Set-Location "C:\Users\wei516\Projects\guess5-computer-web"
python -m http.server 8000 --bind 127.0.0.1
```

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/). Keep that terminal open;
press `Ctrl+C` to stop it. If your Python command is `py -3` or `python3`, use
that instead. Use `8001` in both the command and URL if port 8000 is occupied.

Serve the folder over HTTP instead of opening `index.html` with a `file://` URL:
the browser loads the JavaScript modules as local site resources. There is no
build step, npm install, backend, or database server.

## Verify the browser engine

With Node.js 20 or later, run from this folder:

```powershell
node tests/verify-strategy.mjs
```

The test drives all 30,240 secrets through the same engine used by the page,
checking that every round ends as soon as the secret is identified. It also
accounts for the final exact guess in the strict-success totals and hashes the
complete per-secret result sequence against the original publication. It checks
invalid and inconsistent feedback, restart and damaged strategy data.
The included GitHub Actions workflow runs this test on pushes and pull requests.

Expected results:

| Metric | Value |
| --- | ---: |
| Secrets | 30,240 |
| Non-singleton decisions | 8,600 |
| Maximum success count | 7 |
| Maximum identification count | 6 |
| Total success count | 171,689 |
| Uniform mean success count | 171689 / 30240 = 5.6775462963 |
| Paths ending by identification before an exact match | 22,262 |

Success-count distribution: `1: 1, 2: 5, 3: 110, 4: 1753, 5: 9508, 6: 15245, 7: 3618`.
This is an achieved bound, not a claim of theoretical optimality.

## Strategy source and regeneration

`strategy-data.js` is already included; downloading this repository is sufficient
to play and run the Node.js verification. It is a compact, deterministic export
of these files in the sibling results publication:

```text
../BaC5_pub/optimized_20260925_052028/guess5_optimized.sqlite3
../BaC5_pub/optimized_20260925_052028/guess5_optimized_steps.txt
```

To verify that the included export still matches that source, without writing:

```powershell
python -B tools/export_strategy.py --check
```

To regenerate the export from those same frozen source files:

```powershell
python -B tools/export_strategy.py
node tests/verify-strategy.mjs
```

The exporter reads the SQLite database in read-only mode. It checks the exact
source file hashes, candidate bitsets and decisions, reconstructs all reachable
branches, and verifies every secret against the publication's results. Only
`strategy-data.js` in this web project is written. The exporter does not modify
`BaC5_pub` or the original `BaC` development project. Custom locations can be
passed with `--database`, `--reference` and `--output`.

See [PROVENANCE.md](PROVENANCE.md) for hashes and the browser data format.

## Upload to GitHub

Create a new **public, empty** repository named `guess5-computer-web` under
`Weijie608`. Do not initialize it with a README, license or gitignore; this folder
already contains its project files.

From PowerShell in this folder:

```powershell
git init -b main
git add .
git commit -m "Add five-digit computer guessing game"
git remote add origin https://github.com/Weijie608/guess5-computer-web.git
git push -u origin main
```

If Git asks for an author identity, configure `user.name` and `user.email` in
this repository with your preferred name and GitHub email, then retry the commit.
Complete the GitHub sign-in prompt if authentication is requested. If you choose
a different repository name, update the remote URL and expected site URL.

These are instructions for the repository's owner; local preparation does not
create a remote repository or upload files automatically. GitHub's
[local-code upload guide](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)
describes the same Git workflow.

## Publish with GitHub Pages

After the push:

1. Open the repository on GitHub and go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **Deploy from a branch**.
3. Choose **main** and **/(root)**, then **Save**.
4. Wait for the Pages deployment to finish. The expected address is:
   [https://weijie608.github.io/guess5-computer-web/](https://weijie608.github.io/guess5-computer-web/).

All assets use relative paths, so the game works at a GitHub Pages project
subpath. The empty `.nojekyll` file selects static-file publishing. The workflow
in this repository verifies the strategy; branch-based Pages publishing is
configured separately using the settings above. See GitHub's
[Pages publishing-source guide](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

For later updates (the repository and `origin` already exist):

```powershell
node tests/verify-strategy.mjs
git add .
git commit -m "Update guessing game"
git push
```

If Pages is configured to publish `main` and `/(root)`, each push automatically
triggers a new deployment. There is no need to recreate the repository, repeat
`git init`, regenerate the unchanged strategy, or configure Pages again. Wait
for the **pages build and deployment** run in **Actions** to succeed, then
reload the site. Use `Ctrl+F5` if your browser still displays cached files.

After the live page is confirmed, its URL can replace the four-digit placeholder
in the results publication. This project does not edit that publication.

## Files

| File | Purpose |
| --- | --- |
| `index.html`, `styles.css`, `icon.svg` | Responsive English interface and artwork. |
| `app.js` | Feedback selection, error messages, history, answer reveal and restart. |
| `engine.js` | Deterministic game state, completion on identification and success-count accounting. |
| `strategy-data.js` | Frozen five-digit policy, about 452 KB. |
| `tools/export_strategy.py` | Read-only source verification and reproducible export. |
| `tests/verify-strategy.mjs` | Exhaustive JavaScript verification and behavior checks. |
| `.github/workflows/verify.yml` | Verification in GitHub Actions. |

There are no external fonts, JavaScript libraries, cookies or service workers.
The page needs its static files to load; it does not promise an offline reload.
No license has been added.
