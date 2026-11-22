# Urban Kitchen

Public website for Urban Kitchen in Pleasant Grove, and the front-of-house staff portal. The live site is [urbankitchen-pg.com](https://urbankitchen-pg.com). Netlify site name: `iridescent-chaja-3ff4f3`.

The public pages are static HTML. Do not change `_headers` or `_redirects` for a routine content edit. The staff portal is a phone page at `/staff` plus the `staff` Netlify Function.

## Staff portal

Servers, hosts, and bussers open `/staff`, sign in with a 4–6 digit PIN, and check off today's side work for the role they are on. Each check records the person, the task, and the time in America/Denver. Managers can see who did what, which items were missed, and any earlier day.

Host and Busser lists are marked Friday–Sunday, matching the printed sheets. Those roles can still be used on another day when the floor needs them.

### Why Netlify Blobs

Roster, task lists, and one document per day are a small amount of JSON. [Netlify Blobs](https://docs.netlify.com/blobs/overview/) is already included with this site, so the portal does not add a database plan or another account. The function uses the site-level store `uk-staff`, which keeps data across deploys. Saves use conditional writes so two phones checking items at the same time do not erase each other.

Netlify Database is a better fit for a large relational app, and it is a separate product to provision. Blobs fits this site: plain Netlify, no extra paid service, and the staff data stays on the same site as the website.

### Environment variables

In Netlify, open site `iridescent-chaja-3ff4f3` → Site configuration → Environment variables. Set these before anyone is added.

| Variable | When to set it | What it does |
| --- | --- | --- |
| `UK_STAFF_SETUP_SECRET` | Required to create the first manager | One-time secret typed on `/staff`. Generate it with `openssl rand -base64 32`. Remove it after the first manager exists. |
| `UK_STAFF_PIN_PEPPER` | Set before the first PIN is saved | Private value used to find an account from a PIN without storing the PIN. It never goes in Blobs. Do not change it later; existing PINs would have to be entered again. |
| `UK_STAFF_SESSION_SECRET` | Recommended | Signs the sign-in cookie. If it is unset, the portal creates one and stores it in Blobs. Setting it here keeps a copy of the blob store from being enough to mint a session. |

PINs and manager passwords are stored only as scrypt hashes. The staff page cannot show a PIN after it is saved. A manager can replace it.

Short PINs are easy to guess, so sign-in slows down and then locks:

- The same guess locks for 30 minutes after 8 misses.
- One network locks for 30 minutes after 40 misses, so a shared restaurant Wi-Fi can absorb a few typos.
- The whole sign-in locks for 15 minutes after 50 misses.

Use six digits when Genius allows it. Manager accounts can use a password of 8 to 72 characters instead of a PIN.

### First manager

1. Add `UK_STAFF_SETUP_SECRET` in Netlify. Add the pepper and session secret at the same time if you are using them.
2. Deploy with the command below.
3. Open `https://urbankitchen-pg.com/staff`.
4. Enter the setup secret, the manager's name, and a PIN or password.
5. After that account exists, the setup form no longer appears. Delete `UK_STAFF_SETUP_SECRET` in Netlify.
6. Sign in, add each employee, and type the PIN they already use on Genius.

A manager can then assign who has which role for a day. If a role is left open, that person can claim it on their phone, and the report shows that they chose the shift.

Managers can rename tasks, remove tasks, and add roles (a kitchen list or an opening list later) from the Lists tab. No code change is required. Today's checklist follows the current list. A past day keeps the check-off record from that day.

### Deploy

This site is deployed with the Netlify CLI, not a GitHub connection. From the repo root, with the folder linked to `iridescent-chaja-3ff4f3`:

```sh
npm install
netlify deploy --prod
```

`npm install` has to run first. The staff function depends on `@netlify/blobs`, and the CLI bundles that dependency into the function during deploy.

### Local demo and tests

```sh
npm test
npm run staff-demo
```

The demo serves the site at `http://127.0.0.1:4173/staff` with sample employees. Their PINs are printed in the terminal and exist only in that local process.

`npm test` runs the reservation checks and the staff API checks (sign-in, lockout, check-offs, reports, and task edits).
