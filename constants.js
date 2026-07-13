// Baked-in constants for Watch Together. None of these are secrets — the
// real secret (a Firebase service-account key) lives only in the Worker,
// never in the extension. These are safe to ship in the client:
//   - WORKER_BASE_URL is just the Worker's public HTTPS endpoint.
//   - FIREBASE_DATABASE_URL is a public database URL (access is enforced
//     by Firebase auth + rules, not by keeping the URL secret).
//   - FIREBASE_WEB_API_KEY is Firebase's public web API key, which is
//     designed to be embedded in client-side code (it identifies the
//     Firebase project, it does not authorize access on its own).
const WORKER_BASE_URL = 'https://watch-together-worker.michaelyuanhao.workers.dev';
const FIREBASE_DATABASE_URL = 'https://auto-playback-default-rtdb.firebaseio.com';
const FIREBASE_WEB_API_KEY = 'AIzaSyBOQEzZ1qFebQmMwJlOVc2KVzkhEc70J0s';
