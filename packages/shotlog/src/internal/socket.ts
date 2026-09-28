/**
 * Socket addresses of Requests adapted by toNodeHandler. Kept out of headers so a client
 * can never supply one.
 */
export const socketAddresses = new WeakMap<Request, string>();
