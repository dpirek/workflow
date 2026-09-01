import { openDatabase } from './database/database.js';
import { WorkflowEngine } from './engine/workflow-engine.js';
import { startHttpServer } from './mcp/server.js';

const engine = new WorkflowEngine(openDatabase());
const http = await startHttpServer(engine);
console.log(JSON.stringify({ event: 'server.started', mcp: `${http.url}/mcp`, health: `${http.url}/health` }));

let closing = false;
async function shutdown(signal) {
  if (closing) return;
  closing = true;
  console.log(JSON.stringify({ event: 'server.stopping', signal }));
  await http.close();
  engine.close();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () =>
    shutdown(signal).then(
      () => process.exit(0),
      (error) => {
        console.error(error);
        process.exit(1);
      },
    ),
  );
}
