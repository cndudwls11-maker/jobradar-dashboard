# Google Cloud Scheduler + Cloud Run Job

This directory contains a Cloud Run Job that calls the authenticated JobRadar Pages API. It does **not** scrape websites itself. The four current collectors intentionally return `unconnected` until the providers' API access or written permission is in place. Until then the scheduled run records four unconnected site outcomes and stores no jobs.

## Prerequisites

- A Google Cloud project with billing enabled and `gcloud` authenticated.
- Cloud Run, Cloud Scheduler, Artifact Registry, and Cloud Build APIs enabled.
- A secure `SCHEDULER_TOKEN` secret configured on the JobRadar Pages Production environment. Do not put it in GitHub or the image.
- The Cloudflare D1/Pages deployment is already managed by the JobRadar project. This job calls its API; it never connects to D1 directly.
- Site-specific API approvals/access keys and compliant collectors must be implemented before any actual posting data can be collected.

## Deploy

Run from the repository root. Replace `PROJECT_ID` and the token. This publishes a container image and creates a Cloud Run Job and daily 09:00 Scheduler entry in `Asia/Seoul`; it does not deploy the Pages site.

```bash
gcloud config set project PROJECT_ID
gcloud services enable run.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com cloudbuild.googleapis.com
gcloud artifacts repositories create jobradar --repository-format=docker --location=asia-northeast3
gcloud builds submit --tag asia-northeast3-docker.pkg.dev/PROJECT_ID/jobradar/jobradar-scheduler:latest --file cloudrun/Dockerfile .
gcloud run jobs create jobradar-daily-collection \
  --image asia-northeast3-docker.pkg.dev/PROJECT_ID/jobradar/jobradar-scheduler:latest \
  --region asia-northeast3 --tasks 1 --max-retries 1 --task-timeout 60s \
  --set-env-vars JOBRADAR_SCHEDULED_COLLECTION_URL=https://jobradar-dashboard-btp.pages.dev/api/scheduled-collection \
  --set-secrets JOBRADAR_SCHEDULER_TOKEN=JOBRADAR_SCHEDULER_TOKEN:latest
gcloud scheduler jobs create http jobradar-daily-collection-9am \
  --location asia-northeast3 --schedule "0 9 * * *" --time-zone Asia/Seoul \
  --uri https://asia-northeast3-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/PROJECT_ID/jobs/jobradar-daily-collection:run \
  --http-method POST --oauth-service-account CLOUD_RUN_INVOKER_SA@PROJECT_ID.iam.gserviceaccount.com
```

The Scheduler service account must have `roles/run.invoker` on the Cloud Run Job. Store the token with Secret Manager and grant the Cloud Run Job service account `roles/secretmanager.secretAccessor`.

## Limits and cost

One Scheduler job runs once daily (about 30 invocations/month). Cloud Scheduler currently includes three free jobs per billing account; the documented paid price is $0.10 per job per 31 days beyond the free allowance. Cloud Run free usage is shared at the billing-account level and depends on region, CPU, memory, and duration. Actual browser/site work is not enabled by this proxy job. Review current Google pricing before use and set a budget alert.

## Current state / limitation

This is deployment configuration only. It is not deployed from this repository because no Google Cloud SDK, active Google Cloud project, or authenticated account is configured in the development environment. Scheduler deployment must wait until the owner configures a Google Cloud project and the production scheduler secret. The job itself only calls the Worker API; it cannot control the user's Ego Browser.