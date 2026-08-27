"""List Neon tables and columns"""
import os
import psycopg

conn = psycopg.connect(os.environ['NEON_URL'], sslmode='require')
cur = conn.cursor()

cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
print("TABLES:")
for (t,) in cur.fetchall():
    print(f"  {t}")

print()
for t in ['stock_intro','stock_industry','financial_reports','capital_structure','stock_basic',
          'valuation','company','twse','tpex','dividend','monthly_revenue','institutional',
          'stock_profile','etf_holdings','big_holders','company_info']:
    cur.execute("SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=%s ORDER BY ordinal_position", (t,))
    cols = cur.fetchall()
    if cols:
        print(f"{t}:")
        for c, d in cols:
            print(f"  {c} ({d})")
        print()

conn.close()
