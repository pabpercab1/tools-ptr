# Azure Deployment Guide (Beginner Friendly)

This repository is a TanStack Start SSR app. Azure deployment should use Azure App Service with a Node runtime.

Important:

- The default local build can target Cloudflare.
- For Azure, always build with `NITRO_PRESET=node-server`.
- Runtime entrypoint is `.output/server/index.mjs`.

## Option A: Manual Deployment (Portal + CLI)

Use this if you want to learn each step and deploy by hand.

### 1) Prerequisites

- Azure subscription
- Azure CLI installed
- Logged in: `az login`
- Node.js 22 installed locally

### 2) Create resources

```powershell
$RG='rg-ptr-tools'
$LOC='westeurope'
$PLAN='plan-ptr-tools'
$APP='ptr-tools-<unique-name>'

az group create --name $RG --location $LOC
az appservice plan create --name $PLAN --resource-group $RG --sku B1 --is-linux
az webapp create --resource-group $RG --plan $PLAN --name $APP --runtime "NODE|22-lts"
```

### 3) Configure app settings and startup command

```powershell
az webapp config appsettings set --resource-group $RG --name $APP --settings `
  SCM_DO_BUILD_DURING_DEPLOYMENT=true `
  NITRO_PRESET=node-server `
  NODE_ENV=production

az webapp config set --resource-group $RG --name $APP --startup-file "node .output/server/index.mjs"
```

### 4) Deploy manually from your machine

From repository root:

```powershell
az webapp up --resource-group $RG --name $APP --runtime "NODE|22-lts" --sku B1
```

### 5) Verify

```powershell
az webapp show --resource-group $RG --name $APP --query defaultHostName -o tsv
az webapp log tail --resource-group $RG --name $APP
```

Open:

- `https://<app-name>.azurewebsites.net`

Test these routes:

- `/majority`
- `/members`
- `/polls`
- `/api/ptr/nations`

## Option B: Automatic Deployment with GitHub Action (Azure)

Use this for CI/CD so pushes deploy automatically.

This repo already includes workflow file:

- `.github/workflows/deploy-azure-webapp.yml`

Current trigger in that file:

- Push to branch `azure`
- Manual run from Actions tab (`workflow_dispatch`)

### 1) Create publish profile secret

In Azure Portal:

1. Open your Web App.
2. Click Download publish profile.

In GitHub repository:

1. Go to Settings -> Secrets and variables -> Actions.
2. Add secret `AZURE_WEBAPP_PUBLISH_PROFILE` with the full publish profile XML content.
3. Add secret `AZURE_WEBAPP_NAME` with your Azure Web App name.

### 2) Confirm Azure startup settings once

The workflow deploys files, but startup config belongs to the Azure Web App. Run once:

```powershell
az webapp config appsettings set --resource-group <rg> --name <app-name> --settings `
  NITRO_PRESET=node-server `
  NODE_ENV=production

az webapp config set --resource-group <rg> --name <app-name> --startup-file "node .output/server/index.mjs"
```

### 3) Deploy with GitHub Action

Choose one:

- Push your commit to branch `azure`.
- Or run workflow manually in GitHub Actions.

Workflow behavior:

1. Installs dependencies.
2. Builds with `NITRO_PRESET=node-server`.
3. Deploys `.output` to Azure Web App.

## Which Option Should You Use?

- Manual option: best for first-time learning and debugging.
- GitHub Action option: best for repeatable team deployments.

## Troubleshooting

- App starts but throws errors quickly:
  - Check startup command is `node .output/server/index.mjs`.
- Deploy succeeds but app is down:
  - Confirm `NITRO_PRESET=node-server` in App Settings.
- 502 or timeout:
  - Check `az webapp log tail` and verify outbound access to upstream APIs.

## Recommended Next Improvement

Move hardcoded values to environment variables:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `PTR_API_UPSTREAM`

Then set them in Azure App Settings (or Key Vault references).
