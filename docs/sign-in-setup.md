# Sign in with Microsoft, Google and passkeys

How to switch on the sign-in options from Milestone 5. Passkeys need no setup. Microsoft and Google each need an app registration, and their buttons stay hidden until its id and secret are in `/opt/console/.env`.

Every way in still ends with a second step: a passkey, or a code from an authenticator app. A passkey on its own is both steps, since the device already checks the person's fingerprint, face or PIN.

## 1. Microsoft (Entra ID)

One app registration serves customers (any work, school or personal Microsoft account) and staff (only our own Microsoft 365 tenant).

1. Sign in to https://entra.microsoft.com as a Global Administrator of the Fourth Generation Technologies tenant.
2. Go to **Identity > Applications > App registrations > New registration**.
3. Fill in:
   - **Name:** `Fourth Generation Technologies Cloud Console`
   - **Supported account types:** *Accounts in any organizational directory (Any Microsoft Entra ID tenant - Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)*
   - **Redirect URI:** platform **Web**, `https://console.fourthgeneration.technology/auth/microsoft/callback`
4. Click **Register**. On the Overview page copy:
   - **Application (client) ID** into `MICROSOFT_CLIENT_ID`
   - **Directory (tenant) ID** into `MICROSOFT_STAFF_TENANT_ID`
5. **Authentication** (left menu) > **Add URI** under Web: `https://console.fourthgeneration.technology/admin/auth/microsoft/callback`. Leave both "Access tokens" and "ID tokens" unticked (the console uses the code flow). Click **Save**.
6. **Certificates & secrets > Client secrets > New client secret.** Description `Cloud Console`, expires in 24 months. Copy the **Value** (not the Secret ID) into `MICROSOFT_CLIENT_SECRET`. Put a reminder in the calendar a month before it expires.
7. **Token configuration > Add optional claim.** Token type **ID**, tick `email` and `xms_edov`, click **Add** (accept the prompt to add the Microsoft Graph email permission).
8. **API permissions:** it should list Microsoft Graph `email`, `openid`, `profile` and `User.Read`, all delegated. Nothing else is needed.
9. **Branding & properties:** set the publisher domain to `fourthgeneration.technology` if it is verified, and the home page and privacy links to the console's.

A customer's work account counts as proof of their email only when Microsoft has checked their organisation owns the email's domain (the `xms_edov` claim). Otherwise the console refuses to match it to an account and asks them to sign in with their email.

## 2. Google

1. Sign in to https://console.cloud.google.com with the company Google account, and create a project called `Cloud Console` (or pick an existing one).
2. **APIs & Services > OAuth consent screen** (or **Google Auth Platform > Branding**):
   - **User type:** External
   - **App name:** `Fourth Generation Technologies Cloud Console`
   - **Support email** and **developer contact:** the support address
   - **Authorised domain:** `fourthgeneration.technology`
   - **Scopes:** `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` only. These need no Google review.
   - **Publish** the app (Audience > Publish app), so anyone can use it, not only test users.
3. **APIs & Services > Credentials > Create credentials > OAuth client ID.**
   - **Application type:** Web application
   - **Name:** `Cloud Console`
   - **Authorised redirect URIs:** `https://console.fourthgeneration.technology/auth/google/callback`
4. Copy the **Client ID** into `GOOGLE_CLIENT_ID` and the **Client secret** into `GOOGLE_CLIENT_SECRET`.

Google is for customers only. Staff sign in with Microsoft.

## 3. Put them on the server

```sh
sudo nano /opt/console/.env
```

Add (or fill in):

```sh
MICROSOFT_CLIENT_ID=...
MICROSOFT_CLIENT_SECRET=...
MICROSOFT_STAFF_TENANT_ID=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# Leave unset (or "no") so staff can't use passwords once Microsoft works.
# "yes" keeps passwords as a way in if Microsoft is down.
# STAFF_PASSWORD_SIGN_IN=yes
```

Then restart the app so it reads them:

```sh
sudo -u deploy console restart
```

## 4. Check it

1. Open https://console.fourthgeneration.technology/sign-in in a private window. **Sign in with Microsoft**, **Sign in with Google** and **Sign in with a passkey** show above the email form.
2. Staff: open `/admin/sign-in`. **Sign in with Microsoft** shows, and the password form is gone (unless `STAFF_PASSWORD_SIGN_IN=yes`). Sign in with your Fourth Generation Technologies Microsoft account, then your code or passkey. The first time, the console matches you to your staff account by email.
3. Staff: add a passkey at `/admin/account` (Your sign-in, in the menu).

Before switching off staff passwords, make sure every staff member's email in the staff console is the same as their Microsoft 365 address.

## How the options behave

- **New customers** can sign up with Microsoft or Google: the email comes from the account (so it is already confirmed) and there is no password. They then set up a passkey or an authenticator app.
- **Existing customers** who press Sign in with Microsoft or Google are never signed straight in. They sign in the usual way once, and the account is then linked. They can also link and unlink accounts on the Security page.
- **Passkeys** are added on the Security page (customers) or Your sign-in (staff), or chosen instead of an authenticator app when setting up. Each passkey works only on this console's address.
- **The recent check:** paying by card, inviting or changing team members, giving or taking licences, changing a service's quantity, and changing passkeys, linked accounts or backup codes need a passkey or code in the last 15 minutes. Signing in counts. Otherwise the console asks for one and then returns to the page.
- **No SMS codes**, by design.
