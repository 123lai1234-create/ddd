# Render Deployment Guide

This repository contains two different concerns:

- Python research code for protein design experiments
- A static portfolio website built from the HTML pages in the repo root

It now supports two Render deployment shapes:

- Static-only: publish the website pages with no backend
- Full portfolio stack: static site + FastAPI service + Render Postgres for inquiry storage

## Why This Repo Is Simpler Than the HackMD Example

The HackMD article uses a stack with React, Golang, and PostgreSQL. This project still does not need React or Docker, but it can now use Render Postgres in a smaller architecture.

- No Docker image is required
- No frontend framework build chain is required
- The website itself remains static
- If you want Render DB, add the included Python API service and Postgres database

The correct target on Render is one of these:

- Static Site only, if you just want to host pages
- Static Site + Web Service + Postgres, if you want the About Me contact form to persist data

## Files Already Prepared

- [render.yaml](render.yaml): Render blueprint for static site, API service, and Postgres
- [scripts/build_static_site.sh](scripts/build_static_site.sh): builds the deployable bundle into dist
- [site_api/main.py](site_api/main.py): FastAPI service for inquiry writes and DB health
- [site_api/requirements.txt](site_api/requirements.txt): isolated backend dependencies for Render web service
- [app-config.js](app-config.js): local frontend config fallback
- [.gitignore](.gitignore): excludes local environment files and model weights from git

The build only publishes:

- HTML pages
- README
- demo notebook
- PNG assets in outputs
- generated app-config.js for frontend API settings

It does not publish:

- .venv
- dist
- Python source as a static asset
- model weights such as outputs/\*.pt

The database-backed path adds a separate web service and database, so the static site remains clean while the form writes are handled server-side.

## Recommended Deployment Path

1. Initialize a git repository if this folder is not already tracked.
2. Create a GitHub repository and push this project to GitHub.
3. In Render, choose New + Blueprint.
4. Connect the repository.
5. Render will read [render.yaml](render.yaml) automatically and create:
   - the static portfolio site
   - the FastAPI web service
   - the Postgres database
6. After the first deploy, open [about_me.html](about_me.html) and verify that the contact section reports API and DB connectivity.

## GitHub Path

This is now the recommended path for this project.

- Render integrates directly with GitHub repositories for Blueprint-based deploys.
- The existing [render.yaml](render.yaml), [scripts/build_static_site.sh](scripts/build_static_site.sh), and [site_api](site_api) folder can be reused without changes.
- Once the repo is on GitHub, Render can auto-deploy on every push.

If you later decide not to use GitHub, GitLab and Bitbucket are still valid alternatives because Render is Git-based rather than GitHub-only.

## If You Prefer Manual Render Setup

Create the following resources in Render manually if you do not want to use Blueprint sync:

1. Static Site
   - Build Command: bash ./scripts/build_static_site.sh
   - Publish Directory: ./dist
   - Environment variable: API_BASE_URL=https://jtlai-engineering-biomed-api.onrender.com
2. Web Service
   - Runtime: Python
   - Build Command: pip install -r site_api/requirements.txt
   - Start Command: uvicorn site_api.main:app --host 0.0.0.0 --port $PORT
   - Health Check Path: /healthz
3. Render Postgres
   - Plan: Free is available, but note the 30-day limit on free Postgres instances in current Render pricing

Then set the web service DATABASE_URL from the created Postgres instance connection string.

## Important Routes

The blueprint already defines redirects for cleaner URLs:

- /about -> about_me.html
- /works -> works.html
- /gene-ai -> gene_ai.html
- /ngs -> ngs.html
- /report -> report.html
- /interview -> interview_prep.html

The API service also exposes:

- /healthz
- /api/inquiries
- /api/inquiries/stats

## Custom Domain

If you want to follow the domain section of the HackMD article, that still applies.

1. Buy or prepare your domain from a registrar.
2. In Render, open the deployed site and add the domain in Custom Domains.
3. Copy the DNS values Render gives you.
4. Add the required records at your registrar.
5. Wait for DNS propagation and recheck the domain status in Render.

## Local Validation Before Pushing

From the project root, the website bundle can be regenerated with the existing script logic. The expected output directory is dist.

Check that dist contains:

- index.html
- about_me.html
- works.html
- gene_ai.html
- ngs.html
- report.html
- interview_prep.html
- app-config.js
- outputs/\*.png

## Common Mistakes To Avoid

- Do not deploy the repo root directly as a web service.
- Do not include .venv or model weights in the public site.
- Do not point the frontend directly at Postgres; always go through the API service.
- Do not switch to Docker unless the site is later rebuilt as a real frontend app with a build toolchain.
- Do not copy the React or PostgreSQL parts of the HackMD article into this repo unless the architecture actually changes.
