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
