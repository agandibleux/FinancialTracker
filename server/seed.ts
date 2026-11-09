import { db, monthId, tx } from './db';

const run = (sql: string, ...p: any[]) => db.prepare(sql).run(...p);
const count = (db.prepare('SELECT COUNT(*) c FROM person').get() as { c: number }).c;
if (count > 0 && !process.argv.includes('--force')) { console.log('DB already has data. Use --force to reseed.'); process.exit(0); }

tx(() => {
  for (const t of ['account_balance','expense_entry','income_entry','savings_actual','month','category','account','contribution_room','wealth_year','person'])
    db.exec(`DELETE FROM ${t}`);
  run("INSERT INTO person(name) VALUES ('Alex'), ('Sam')");
  const cats: [string, string, number, number][] = [
    ['Rent / Mortgage', 'fixed', 1, 1800], ['Car insurance', 'fixed', 1, 160], ['Phone', 'fixed', 1, 90],
    ['Internet', 'utility', 1, 0], ['Hydro', 'utility', 1, 0], ['Gas / Heating', 'utility', 1, 0], ['Water', 'utility', 1, 0],
    ['Groceries', 'variable', 1, 0], ['Dining out', 'variable', 1, 0], ['Transport', 'variable', 1, 0],
    ['Travel', 'variable', 0, 0], ['Big purchases', 'variable', 0, 0],
  ];
  for (const c of cats) run('INSERT INTO category(name, kind, counts_as_living, default_amount) VALUES (?,?,?,?)', ...c);
  run("INSERT INTO category(name, kind, counts_as_living) VALUES ('Utilities', 'utility', 1)");
  run("UPDATE category SET parent_id=(SELECT id FROM category WHERE name='Utilities') WHERE kind='utility' AND name!='Utilities'");
  const id = (n: string) => (db.prepare('SELECT id FROM category WHERE name=?').get(n) as { id: number }).id;
  const rnd = (b: number, v: number) => Math.round(b + (Math.sin(b * 7 + v) * v));
  const now = new Date(); const y = now.getFullYear();
  for (let i = 0; i < 12; i++) {
    const d = new Date(y, now.getMonth() - 11 + i, 1);
    const m = monthId(d.getFullYear(), d.getMonth() + 1);
    run("INSERT INTO income_entry(month_id, person_id, source, amount) VALUES (?,1,'Salary',4600)", m);
    run("INSERT INTO income_entry(month_id, person_id, source, amount) VALUES (?,2,'Salary',3900)", m);
    for (const [n, , , def] of cats.filter(c => c[3] > 0)) run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id(n), def);
    run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Internet'), 85);
    run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Hydro'), rnd(120, 40 + i * 3));
    run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Gas / Heating'), rnd(110, 60));
    run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Water'), 45);
    run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Groceries'), rnd(850, 90));
    run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Dining out'), rnd(300, 80));
    run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Transport'), rnd(220, 40));
    if (i % 5 === 3) run('INSERT INTO expense_entry(month_id, category_id, amount) VALUES (?,?,?)', m, id('Travel'), 900);
    if (i < 11) run('INSERT INTO savings_actual(month_id, to_cash, to_investments, note) VALUES (?,?,?,?)', m, 400 + i * 20, 1200 + i * 30, '');
  }
  const a = (p: number, t: string, n: string, b: number) => run('INSERT INTO account(person_id, type, name, balance) VALUES (?,?,?,?)', p, t, n, b);
  a(1, 'CASH', 'Savings', 9000); a(1, 'TFSA', 'TFSA', 42000); a(1, 'RRSP', 'RRSP', 31000); a(1, 'FHSA', 'FHSA', 8000); a(1, 'NONREG', 'Brokerage', 6000);
  a(2, 'CASH', 'Savings', 6000); a(2, 'TFSA', 'TFSA', 28000); a(2, 'RRSP', 'RRSP', 19000); a(2, 'FHSA', 'FHSA', 8000);
  for (const [p, t, room] of [[1,'TFSA',7000],[1,'RRSP',14000],[1,'FHSA',8000],[2,'TFSA',7000],[2,'RRSP',11000],[2,'FHSA',8000]] as const)
    for (const yr of [y, y + 1]) run('INSERT INTO contribution_room(person_id, account_type, year, room) VALUES (?,?,?,?)', p, t, yr, room);
  // 12 month-end balance snapshots per account (growing towards today's balance)
  for (const acc of db.prepare('SELECT id, balance FROM account').all() as { id: number; balance: number }[])
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const bal = Math.round(acc.balance * (1 - 0.012 * (11 - i)));
      run('INSERT INTO account_balance(account_id, date, balance) VALUES (?,?,?)', acc.id, `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`, bal);
    }
  run('INSERT INTO wealth_year(year, start_wealth, return_pct, monthly_contribution, actual_end) VALUES (?,?,?,?,?)', y - 1, 120000, 6, 1500, 138500);
  run('INSERT INTO wealth_year(year, start_wealth, return_pct, monthly_contribution) VALUES (?,?,?,?)', y, 138500, 6, 1600);
});
console.log('Seeded sample data.');
