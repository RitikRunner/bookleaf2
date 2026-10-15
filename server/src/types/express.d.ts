import type { SessionUser } from '../lib/session.js';

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the `authenticate` middleware. Read it with `currentUser(req)`. */
    user?: SessionUser;
  }
}
