# -*- coding: utf-8 -*-
p = 'e2e/fixed-costs.spec.ts'
s = open(p, encoding='utf-8').read()
old = '''    await page.request.delete("/api/expenses?title=" + encodeURIComponent("قسط ماشین تست (1405-07"));'''
new = '''    {
      const exps = await (await page.request.get("/api/expenses?limit=50")).json();
      for (const e of exps.data?.expenses ?? exps.data?.items ?? []) {
        if ((e.title ?? "").includes("قسط ماشین تست")) {
          await page.request.delete(`/api/expenses/${e.id}`);
        }
      }
    }'''
assert old in s, 'anchor not found'
s = s.replace(old, new)
open(p, 'w', encoding='utf-8').write(s)
print('fixed')
