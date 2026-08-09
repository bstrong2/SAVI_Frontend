# SAVI Frontend

## Application Overview

SAVI stands for **S**ensor **A**pplication & **V**isualization **I**nterface. This is the Vue frontend for the SAVI system. It lets users log in, lay out and configure sensors/devices on a canvas, start and monitor recipe runs, view live sensor charts, and manage users and settings.

The frontend is a Vue 3 single page application that:

- Connects to the SAVI backend's REST API for auth, device/sensor configuration, settings, and run/recipe management.
- Connects to the backend's SignalR hub to receive live sensor updates, device logs, and run state changes.
- Stores the logged in user's auth token in `sessionStorage`, so a session lasts for the tab but doesn't persist across browser restarts.

## How to Install / Run

**Prerequisites:**

- [Node.js](https://nodejs.org/) 20 or later, CI runs on Node 24.
- The SAVI backend running and reachable (see the backend's own README for how to start it). The frontend will load without it, but most features need it.

**Install dependencies:**

```bash
npm install
```

**Run the dev server:**

```bash
npm run dev
```

This starts Vite's dev server on `http://localhost:5173`

**Other scripts:**

| Command              | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `npm run build`      | Builds the production bundle into `dist/`.                                          |
| `npm run preview`    | Serves the built `dist/` output locally, for a quick sanity check before deploying. |
| `npm test`           | Runs the test suite once with Vitest.                                               |
| `npm run test:watch` | Runs the test suite in watch mode while you work.                                   |

## Configuration

The backend URL isn't baked into the build. It's read at startup from a plain JSON file:

[`public/config/settings.json`](public/config/settings.json):

```json
{
  "backendUrl": "http://localhost:5176"
}
```

`src/main.js` fetches this file before mounting the app, then makes the value available to every component via Vue's `inject` under the key `BACKEND_URL`.

## Architecture Overview

```
src/
  main.js            Entry point. Loads runtime config, registers FontAwesome,
                      mounts the app with the backend URL provided app wide.

  App.vue            Root component. Owns essentially all app state (SignalR
                      connection, auth, run state, devices, log entries, theme,
                      dialogs)

  App.css            Global styles and theme CSS variables.

  auth/
    roles.js         Permissions enum and the single role gating helper 
                        used across the app.

  constants/
    chart.js         Chart palette.
    colors.js        The app's color palette, also pushed into CSS variables.
    devices.js       Item types, device property definitions
                      used by the device layout canvas.
    enums.js         Shared enums: log levels, run status, connection status,
                      run commands, view names.

  components/
    AppRibbon.vue    Top toolbar: view switching, run controls, theme toggle.
    LogPanel.vue     Bottom log panel, color coded by severity.
    *Dialog.vue      Login, add sensor, start run, log only, report dialogs.
    SensorTile.vue, RectTile.vue   Tiles placed on the device layout canvas.

    views/
      DeviceLayout.vue       Main canvas for placing and configuring devices.
      LoggingDetails.vue     Live chart fed by SignalR and polling.
      DeviceConnections.vue  Device and connection management.
      Settings.vue           App settings, persisted through the backend.
      Users.vue              Admin only user management.
      Recipe.vue             Recipe editing. WIP not finished yet.
```

Here is a diagram of the application flow, created using draw.io. The editable `.drawio` source file lives in [`docs/diagrams/`](docs/diagrams/) in this repo:

![SAVI frontend architecture](docs/images/frontend-architecture.drawio.png)

## Testing / CI Pipeline

Tests are written with [Vitest](https://vitest.dev/) and [`@vue/test-utils`](https://test-utils.vuejs.org/), configured through the `test` block in [`vite.config.js`](vite.config.js).

CI is defined in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) and runs on every push and pull request targeting `main`. It checks out the repo, sets up Node 24, runs `npm ci`, then `npm run build`, then `npm test`.

### Testing the CI Pipeline Locally

Before pushing, you can validate the `ci.yml` workflow itself, catching syntax mistakes or job config errors without waiting on a real GitHub Actions run.

**Prerequisites:**

- Docker Desktop installed and running:
  
  ```powershell
  winget install Docker.DockerDesktop
  ```

- [`actionlint`](https://github.com/rhysd/actionlint), which checks the workflow YAML for syntax errors

- [`act`](https://github.com/nektos/act), which runs GitHub Actions workflows locally in a container:
  
  ```powershell
  winget install nektos.act
  ```

**1. Lint the workflow file:**

```bash
actionlint .github/workflows/ci.yml
```

If there's no output after running it, everything looks good, no syntax problems found.

**2. Dry run the job:**

GitHub runs this workflow on `ubuntu-latest` so:

```bash
act push -j build-and-test --dryrun -P ubuntu-latest=catthehacker/ubuntu:act-latest
```

This doesn't actually execute the install/build/test steps. It verifies the trigger, job, and step definitions all resolve correctly, so you catch a broken workflow file before pushing to GitHub.

## Deployment

The app deploys to **Azure Static Web Apps** via [`.github/workflows/azure-static-web-apps.yml`](.github/workflows/azure-static-web-apps.yml).

- On every push to `main`, the workflow builds and deploys the app using the official `Azure/static-web-apps-deploy` action.

- This requires an `AZURE_STATIC_WEB_APPS_API_TOKEN` repository secret. The built in `GITHUB_TOKEN` is used automatically.
