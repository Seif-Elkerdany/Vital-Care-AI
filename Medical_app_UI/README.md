
# Medical app UI

This UI folder currently contains two frontend entry paths:

- mobile UI (primary): `index.html` + `app.js` + `app.css`
- react UI (secondary): `react.html` + `src/`

The original design source is available at [Figma](https://www.figma.com/design/raj7eDe7TiVJRc9tFyW7MW/Medical-app-UI).

## Running the code

Install dependencies:

```bash
npm i
```

Start Vite:

```bash
npm run dev
```

Open one of these:

- mobile UI: `http://localhost:5173/index.html` (or `http://localhost:5173/`)
- react UI: `http://localhost:5173/react.html`

## Auth integration notes

- both UI paths call backend auth routes on `http://localhost:8000` in local development
- mobile UI now includes sign in/create account directly in `index.html`
- mobile UI protects API calls with bearer tokens after login
  