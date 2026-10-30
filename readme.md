# TurnForge — Offline-first Cube Timer

A responsive speedcubing timer with:

- Private user accounts
- SQLite database
- Offline solve storage
- Online account synchronization
- OLL and PLL algorithm library
- Solve history
- Statistics
- CSV export
- JSON backup and import
- Progressive Web App support

## Requirements

- Node.js 18 or newer
- npm

## Installation

Open the project folder in VS Code.

Run:

npm install

Set the JWT secret in Windows PowerShell:

$env:JWT_SECRET = "your-long-random-secret"

Start the website:

npm start

Open:

http://localhost:3000

Register an account to enable cloud synchronization.

## Deployment

Deploy the Node.js application to a server with persistent storage.

Set JWT_SECRET in the server environment.

Use HTTPS.

Keep the SQLite database on persistent storage.

## Offline support

The service worker caches the application shell.

Solve data is stored locally so the timer can work offline.

When online and signed in, data can synchronize with the server.

## Important

This is a functional starter project, not a complete
feature-for-feature CS Timer replacement.

The scramble generator uses random-move practice sequences,
not official WCA random-state scrambles.
