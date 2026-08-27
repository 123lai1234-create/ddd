import psycopg

DSN = 'postgresql://neondb_owner:npg_aQwV8a0ZUklW@ep-plain-cherry-a17kfemv-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require'

with psycopg.connect(DSN) as c:
    with c.cursor() as cur:
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='market_instruments'
            ORDER BY ordinal_position
        """)
        print('market_instruments cols:', [r[0] for r in cur.fetchall()])

        cur.execute("""
            SELECT code, name, market, metadata_text
            FROM market_instruments
            WHERE code='2330'
        """)
        for r in cur.fetchall():
            mt = r[3] or ''
            print(f'2330 row: code={r[0]} name={r[1]} market={r[2]}')
            print(f'  metadata_text (first 600): {mt[:600]}')
            # Look for shares_outstanding or similar
            import re
            for kw in ['shares_outstanding', 'shares_issued', 'issued_shares', 'capital', 'share_capital', 'market_cap', '流通在外', '股本', '實收', '股份']:
                m = re.search(rf'{kw}["\']?\s*[:=]\s*["\']?([\d,.\s]+)', mt, re.I)
                if m:
                    print(f'  FOUND {kw}: {m.group(1)}')

        # Check financial_reports structure
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name='financial_reports'
            ORDER BY ordinal_position
        """)
        print('financial_reports cols:', [r[0] for r in cur.fetchall()])

        cur.execute("""
            SELECT code, period, revenue, gross_profit, net_income, eps,
                   shares_outstanding, share_capital
            FROM financial_reports
            WHERE code='2330'
            ORDER BY period DESC
            LIMIT 3
        """)
        print('2330 financial_reports:')
        for r in cur.fetchall():
            print(f'  {r}')
