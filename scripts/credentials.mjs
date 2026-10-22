import { randomBytes, createHash } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
const one = randomBytes(32).toString('base64url');
const two = randomBytes(32).toString('base64url');
const admin = randomBytes(32).toString('base64url');
console.log(`PRIVATE — save in your password manager; do not paste into issues/logs/chat.
Player one pairing credential: ${one}
Player two pairing credential: ${two}
Admin backup credential: ${admin}

Server secrets (.dev.vars locally, wrangler secret put in production):
PLAYER_ONE_HASH=${hash(one)}
PLAYER_TWO_HASH=${hash(two)}
ADMIN_TOKEN_HASH=${hash(admin)}
SESSION_SECRET=${randomBytes(32).toString('hex')}
`);
