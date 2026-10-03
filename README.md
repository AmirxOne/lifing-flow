# lifing-flow — لایف‌هاب

اپلیکیشن خصوصی مدیریت زندگی مشترک دو نفره.

## Stack
- Next.js 15 (App Router) + React 19 + TypeScript strict
- Prisma + PostgreSQL 16 (docker, port 5433)
- Tailwind 3 + TanStack Query + Zod
- RTL / فارسی / تقویم شمسی / اعداد فارسی / تومان

## Run
```bash
docker compose up -d      # postgres جدا روی 5433
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev                  # :3300
```

## Test users
- test-owner@example.com / test-partner@example.com (خانواده آ)
- test-other-household@example.com (خانواده ب — ایزوله)
- test-admin@example.com
- رمز همه: Pass1234
