# 🚀 Deployment Guide — Vercel & Nhost Cloud

This guide walks you through deploying **FlowForge AI** to production:
1. **Frontend (Next.js)** ➔ Deployed to **Vercel**
2. **Backend (Postgres + Hasura + Functions + Auth)** ➔ Deployed to **Nhost Cloud**

---

## Part 1: Deploy Backend to Nhost Cloud

### Step 1.1: Create a Project on Nhost Cloud
1. Go to **[app.nhost.io](https://app.nhost.io)** and log in / create a free account.
2. Click **"New Project"**.
3. Select your region (e.g., `us-east-1` or `eu-central-1`).
4. Give your project a name (e.g., `flowforge-ai`).
5. Once created, note your **Subdomain** and **Region** from the Nhost project dashboard (e.g. Subdomain: `xyz123`, Region: `us-east-1`).

### Step 1.2: Connect Your GitHub Repository to Nhost
1. In your Nhost Cloud project dashboard, go to **Settings ➔ Git Repository**.
2. Connect your GitHub account and select your repository: `mohammadkaif1110/Hiring-ai`.
3. Set the **Nhost Base Directory** to `/nhost`.
4. Set the **Functions Base Directory** to `/functions`.
5. Click **Connect**. Nhost will automatically apply database migrations, Hasura metadata, and deploy your serverless functions!

### Step 1.3: Set Nhost Secrets
In Nhost Dashboard ➔ **Settings ➔ Secrets**, add:
- `GROQ_API_KEY`: Your Groq API key from [console.groq.com](https://console.groq.com)

---

## Part 2: Deploy Frontend to Vercel

### Step 2.1: Import Project to Vercel
1. Go to **[vercel.com](https://vercel.com)** and log in / sign up with GitHub.
2. Click **"Add New..." ➔ "Project"**.
3. Import your repository: **`mohammadkaif1110/Hiring-ai`**.

### Step 2.2: Configure Project Settings on Vercel
1. **Framework Preset**: `Next.js` (detected automatically).
2. **Root Directory**: Click **Edit** and select the **`frontend`** directory.

### Step 2.3: Add Environment Variables on Vercel
Expand **Environment Variables** and add the following keys (replace `xyz123` and `us-east-1` with your Nhost Cloud subdomain & region):

| Environment Variable | Example Value |
|----------------------|---------------|
| `NEXT_PUBLIC_NHOST_SUBDOMAIN` | `xyz123` |
| `NEXT_PUBLIC_NHOST_REGION` | `us-east-1` |
| `NEXT_PUBLIC_NHOST_GRAPHQL_URL` | `https://xyz123.graphql.us-east-1.nhost.run/v1` |
| `NEXT_PUBLIC_NHOST_AUTH_URL` | `https://xyz123.auth.us-east-1.nhost.run/v1` |
| `NEXT_PUBLIC_NHOST_STORAGE_URL` | `https://xyz123.storage.us-east-1.nhost.run/v1` |
| `NEXT_PUBLIC_NHOST_FUNCTIONS_URL` | `https://xyz123.functions.us-east-1.nhost.run/v1` |

### Step 2.4: Deploy!
Click **"Deploy"**. Vercel will build your Next.js application and give you a live production URL (e.g. `https://hiring-ai.vercel.app`)!

---

## Part 3: Final Production CORS & Auth Redirect Setup

1. Copy your Vercel live URL (e.g., `https://hiring-ai.vercel.app`).
2. Open **Nhost Dashboard ➔ Settings ➔ Authentication**.
3. Set **Client URL** to `https://hiring-ai.vercel.app`.
4. Open **Nhost Dashboard ➔ Settings ➔ Hasura**.
5. Under **CORS Domain**, add `https://hiring-ai.vercel.app`.

---

🎉 Your full-stack application is now live in production!
