import { Router } from 'express';
import { currentUser } from '../middleware/authenticate.js';
import { realtimeHub } from './hub.js';

export const eventsRouter = Router();

/** Server-Sent Events stream of ticket changes the signed-in user is allowed to know about. */
eventsRouter.get('/', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // stops reverse proxies from buffering the stream
  });
  res.write('retry: 5000\n\n'); // the browser reconnects after 5s if the connection drops

  const unsubscribe = realtimeHub.subscribe(currentUser(req), res);
  req.on('close', unsubscribe);
});
