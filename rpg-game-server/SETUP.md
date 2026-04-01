# Server Setup

## Environment

Copy `.env.example` to `.env` and fill in:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rpg_game?schema=public"
REDIS_URL="redis://localhost:6379"
JWT_ACCESS_SECRET="replace-this-access-secret"
JWT_REFRESH_SECRET="replace-this-refresh-secret"
```

## Prisma

Install dependencies and generate the client:

```bash
npm install
npx prisma generate
```

Create the database schema after `DATABASE_URL` is configured:

```bash
npx prisma migrate dev --name init_auth_storage
```

## Auth Session Policy

- Access token: `1 hour`
- Refresh token: `14 days`
- Each successful reconnect/login rotates the refresh token and extends Redis TTL back to `14 days`
- If the player does not return for more than `14 days`, the Redis refresh session expires and the user must log in again
