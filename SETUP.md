# District website and member registry: setup

Files
- `index.html`: public district website (upload to GitHub Pages)
- `registry.html`: officer sign-in and member registry (upload next to index.html)
- `registry-backend/Code.gs`: the private backend (paste into Google Apps Script)
- `tubod-snippet.html`: link strip for the Tubod church site

## 1. Make the private registry sheet (10 minutes)
1. Use one Google account that the district controls (not a personal one that may change hands). Create a new Google Sheet named `District Registry`.
2. Do not share this sheet with anyone. Do not use File > Share > Publish to web. All access goes through the web app below.
3. In the sheet: Extensions > Apps Script. Delete the sample code, paste all of `Code.gs`, and save.
4. In the function list choose `setup` and press Run. Approve the permissions when asked.
5. Open View > Logs (or Executions). You will see the first sign-in:  username `admin`, plus a temporary password. Copy it.
6. Back in the sheet, open the `Churches` tab and replace the placeholder names with the real names of the 15 churches. Change the names only. Do not change the codes in column A once members exist.

## 2. Publish the backend
1. In Apps Script: Deploy > New deployment > type Web app.
2. Execute as: **Me**. Who has access: **Anyone**. (The app itself still asks for a username and password. "Anyone" only lets the pages reach it.)
3. Deploy and copy the Web app URL that ends with `/exec`.

## 3. Connect the pages
1. In `registry.html` set `API_URL` to that URL. Set `SITE_URL` to your district site address, for example `https://yourname.github.io/district/`. The QR code on each ID card opens that address.
2. In `index.html` set `CONFIG.registryApi` to the same URL. Set the real district name, Sabbath times, church details and leaders in `CONFIG` and `CHURCHES`.
3. Upload both pages (and `logo.png` if you have one) to the GitHub repository for the district site.

## 4. First use
1. Open `registry.html`, sign in as `admin` with the temporary password, and set a new password.
2. Officers tab: add each church clerk (role "Church clerk", with their church) and any district officers. Give each person their temporary password privately. They must change it at first sign-in.
3. Clerks add their members. Each member gets an ID like `IM-TBD-0001-K7`. Print or send the ID card (member dialog > Membership ID card).
4. Anyone can now confirm a member on the public site under "Verify a member" using the ID and last name. The answer is only "active member of [church]" or "could not confirm". It never says why.

## Member statuses
Active, Inactive / lost contact, Left and joined a breakaway group, Transferred to another SDA church, Dropped from membership, Deceased. Every change is logged with who made it and when. Use the "reason or church vote reference" box.

## Security notes
- Passwords are stored as salted hashes. Sessions end after 6 hours or 15 minutes without activity. Five wrong sign-ins lock that username for 10 minutes. The public check is limited per ID and overall.
- Clerks only see their own church. "Check someone" searches the whole district but returns only name, church, status and ID, and every search is logged (60 per officer per hour).
- Turn an officer's account off in the Officers tab as soon as they leave their post.
- This is a Google Sheet, not a hardened database. Keep the Google account protected with 2-step verification, and do not add other editors to the sheet.
- Backups: File > Version history is on by default. Also download the Members tab as a file once a month and keep it somewhere private.
- If you change `Code.gs` later, use Deploy > Manage deployments > Edit > New version so the same `/exec` link keeps working.

## Data privacy (Philippines)
Religious affiliation is sensitive personal information under the Data Privacy Act of 2012. Before entering a person: tell them what is kept and why, and get their consent (a short signed form kept by the clerk is enough). Collect only what you need. Keep the list of people with access short. Let members ask to see or correct their record. Check with your conference office whether it already has a membership records policy you should follow. This is general guidance and not legal advice.

## Photo gallery

Put photos in the `gallery/` folder and list them in `gallery/gallery.json`, for example:

```json
[
  { "src": "gallery/baptism-1.jpg", "caption": "Baptism at Tubod", "church": "Tubod SDA Church" },
  { "src": "gallery/youth-rally.jpg", "caption": "Youth rally", "church": "" }
]
```

Keep each photo under about 400 KB so the page stays fast on mobile data.

## District news feed (share an announcement on the district page)
When a church leader writes an **Announcement**, a "Share on district page" box appears. Only announcements with that box ticked are sent to the district page (text only, never photos, comments or members).
The church's Apps Script needs the updated `Code.gs` for this: paste it over the old one, then **Deploy > Manage deployments > pencil > New version > Deploy**. Until a church has done this, the district page simply shows nothing from that church.

## District announcements (post once, show everywhere)

District officers sign in to the registry, open **Announcements**, and post a title and message. Choose **Whole district** to show it on the district website and on every church site, or pick one church. Pinned posts stay at the top. Edit or Delete there and it changes everywhere.

- Needs one step after updating: paste the new `Code.gs` into the registry's Apps Script and **Deploy > Manage deployments > Edit > New version**. A `News` tab is created in the registry sheet by itself.
- Church sites show it as a "From the district" card on the signed-in Home page (`district-news.js`, added by `tools/district_news_layer.py`; new churches built with `make_church.py` get it automatically). It updates within about 10 minutes.
- Only the title, message, date and church are public. Never put names or phone numbers in an announcement.

## District events and Sabbath attendance

- **Events** (district officers only): registry > **Events**. Post the name, date, time and place. Choose the whole district or one church. It shows on the district site and as a "District events" card on church sites, each with **Add to my calendar** and **Share**. Past events drop off by themselves.
- **Attendance** (everyone who signs in to the registry): registry > **Attendance**. A clerk enters one number per Sabbath for their own church. District officers can enter for any church and see a district chart. No names are stored. Entering the same date again replaces the number.
- **Share**: every announcement and event has a **Share** button. On a phone it opens the share sheet (Messenger, Facebook). On a computer it copies the text and link. An announcement link opens the district site at that announcement.
- The registry script needs a new deployment each time `Code.gs` changes (Deploy > Manage deployments > Edit > New version). The `Events` and `Attendance` tabs create themselves in the registry sheet.

## Reminders, officer guide, ID card sheet and poster

- **Attendance reminder**: when a clerk signs in and the last Sabbath's number is missing, a yellow bar offers to open the Attendance tab. District officers see which churches that have sent numbers before have not sent the last one. No server change needed.
- **This week**: district events within 7 days show a Today / Tomorrow / This Sabbath / This week badge on the district site and on every church Home page (run `tools/district_news_layer.py` on a church folder to update it).
- **Officer guide**: `guide.html` (English and Bisaya, prints on one or two pages), linked from the registry header.
- **Print ID cards**: Members tab, "Print ID cards" prints the active members in the list shown, ten to an A4 page, each with a QR code. The print is logged like an export.
- **Sabbath poster**: Events section of the district site, "Make a Sabbath poster" draws a 1080x1350 picture from the next district event and the day's KJV verse. It needs no server.
