// Test fixture for target/runner.test.ts — listens on the given port ~500ms after start,
// mirroring "a script that takes a moment to come up" (npm start / ng serve, in miniature).
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? process.env.PORT ?? 0);

setTimeout(() => {
  const server = createServer((_req, res) => {
    res.end('fake target ok');
  });
  server.listen(port, () => {
    console.log(`fake target listening on ${port}`);
  });
}, 500);
