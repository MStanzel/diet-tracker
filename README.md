# Diet Tracker

A private calorie and protein tracker for two people. It runs in the browser and installs on Android from Chrome ("Add to Home screen"). Data is stored in a free Supabase database and syncs between both phones.

## One-time setup (about 30 minutes)

### 1. Create the database (Supabase)
1. Go to https://supabase.com, sign up (free), and click **New project**. Give it any name, set a database password (save it somewhere), and pick a region near you. Wait about 2 minutes while it builds.
2. In the left menu, open **SQL Editor** and click **New query**.
3. Open `setup.sql` (it came separately, **not** in this folder), copy all of it, paste it into the editor, and click **Run**. You should see `Setup complete ✔`.
4. Left menu: **Authentication → Users → Add user → Create new user**. Enter an email and password and tick **Auto Confirm User**. Do this once for each of you, or create one shared login.
5. **Authentication → Sign In / Providers**: turn **off** "Allow new users to sign up", then click Save. This way nobody else can create an account.
6. Find your keys: open **Project Settings** (gear icon) and look under **Data API** for the **Project URL**, and under **API Keys** for the **Publishable** key (older projects call it **anon public**; either one works). Keep this tab open.

### 2. Put the app online (GitHub Pages)
1. Sign up at https://github.com (free) and click **New repository**. Name it `diet-tracker`, set it to **Public** (free Pages hosting requires public; your data is still private, see below), and click **Create**.
2. On the new repo page, click **uploading an existing file**. Drag **everything inside** this folder (index.html, config.js, and the css, js, vendor, icons and data folders) into the box, then click **Commit changes**.
3. Click `config.js`, then the ✏️ pencil icon. Paste the Project URL and the anon key between the quotes, then click **Commit changes**.
4. Open **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, pick branch **main** and folder **/ (root)**, and click **Save**.
5. After 1–2 minutes your app is live at `https://YOUR-USERNAME.github.io/diet-tracker/`.

### 3. Install on each phone
Open the link in **Chrome**, sign in, then tap **⋮ → Add to Home screen → Install**.

## Good to know
- **Privacy:** the code is public, but your data isn't. The database only answers to signed-in users, and sign-ups are turned off. The "anon" key is designed to be public.
- **Updating the app:** edit or replace files in the GitHub repo. Phones pick up the change the next time the app opens (use More → Refresh app to force it).
- **Supabase free tier** pauses a project after a week with no activity. Daily use keeps it awake. If it ever pauses, click "Restore" in Supabase.
- **Backup:** More → Download everything (Excel).
- **Demo mode:** if `config.js` is left empty, the app runs with sample data stored on that device only.

## Files
- `index.html`, `css/app.css`: page and styles
- `js/today.js`: Today screen · `js/add.js`: adding food · `js/library.js`: foods and recipes
- `js/progress.js`: charts · `js/more.js`: goals, notes, export · `js/scan.js`: barcode and label photo
- `js/calc.js`: goal formula (Mifflin-St Jeor) and totals · `js/db.js`: database
- `vendor/vendor.js`: bundled libraries (Preact, Supabase). No build step needed.
