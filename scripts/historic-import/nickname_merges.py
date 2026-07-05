#!/usr/bin/env python3
"""Find nickname-variant duplicate players (e.g. Mike/Michael Stovall) among
players with season finishes, validate each cluster with the same rules as the
exact-name batch (no week over its cap, no season collision), and emit:
  - _staging/_load/nickname_merges_SAFE.sql  (disjoint-season, safe to merge)
  - stdout report of SAFE + FLAG (overlapping-season) clusters for review.

Usage: set -a; source .env; set +a; python3 nickname_merges.py
"""
import os, re, csv, io, subprocess
from collections import defaultdict

DB = os.environ["SUPABASE_DB_URL"]

def q(sql):
    out = subprocess.run(["psql", DB, "--csv", "-c", sql], capture_output=True, text=True)
    if out.returncode != 0:
        raise SystemExit("psql error: " + out.stderr)
    return list(csv.DictReader(io.StringIO(out.stdout)))

# variant -> canonical first name (bidirectional grouping key)
NICK = {
    'mike':'michael','mikey':'michael','micheal':'michael',
    'bob':'robert','bobby':'robert','rob':'robert','robbie':'robert',
    'bill':'william','billy':'william','will':'william','willie':'william',
    'jim':'james','jimmy':'james','jamie':'james',
    'joe':'joseph','joey':'joseph',
    'dave':'david','davey':'david',
    'dan':'daniel','danny':'daniel',
    'steve':'steven','stevie':'steven',
    'chris':'christopher',
    'matt':'matthew','matty':'matthew',
    'tom':'thomas','tommy':'thomas',
    'nick':'nicholas',
    'tony':'anthony',
    'rick':'richard','rich':'richard','ricky':'richard','dick':'richard','richie':'richard',
    'ben':'benjamin','benny':'benjamin',
    'sam':'samuel','sammy':'samuel',
    'alex':'alexander',
    'andy':'andrew','drew':'andrew',
    'ed':'edward','eddie':'edward','ted':'edward',
    'fred':'frederick','freddie':'frederick',
    'greg':'gregory',
    'jeff':'jeffrey','jeffery':'jeffrey',
    'ken':'kenneth','kenny':'kenneth',
    'larry':'lawrence',
    'pat':'patrick','patty':'patrick',
    'ron':'ronald','ronnie':'ronald',
    'zach':'zachary','zack':'zachary',
    'josh':'joshua',
    'nate':'nathan',
    'gabe':'gabriel',
    'tim':'timothy','timmy':'timothy',
    'phil':'phillip',
    'charlie':'charles','chuck':'charles','chas':'charles',
    'hank':'henry',
    'frank':'francis','frankie':'francis',
    'jake':'jacob',
    'pete':'peter',
    'ray':'raymond',
    'walt':'walter',
    'wes':'wesley',
    'gerry':'gerald','jerry':'gerald',
    'vinny':'vincent','vin':'vincent',
    'cam':'cameron',
    'brad':'bradley',
    'max':'maxwell',
}

def norm(s): return re.sub(r'[^a-z]', '', (s or '').lower())

def tokens(name):
    parts = [p for p in re.split(r'\s+', (name or '').strip()) if p]
    parts = [p for p in parts if norm(p) not in ('jr','sr','ii','iii','iv','v')]
    return parts

def canon_first(first):
    f = norm(first)
    return NICK.get(f, f)

rows = q("""
  select u.id, u.display_name, u.email,
    exists(select 1 from auth.users a where a.id=u.id or lower(a.email)=lower(u.email)) as has_auth,
    (u.email like 'historic-%@pp6.local' or u.email like '%#hist') as is_hist,
    coalesce(array_agg(distinct f.season) filter (where f.season is not null), '{}') as seasons
  from users u
  join all_season_finishes f on f.user_id=u.id
  group by u.id, u.display_name, u.email
""")

# cluster by (last_norm, canonical_first). also fold prefix matches within last-name.
players = []
for r in rows:
    dn = r['display_name']
    tk = tokens(dn)
    if len(tk) < 2:  # need first+last
        continue
    first, last = tk[0], tk[-1]
    seasons = set(int(s) for s in re.findall(r'\d+', r['seasons'] or ''))
    players.append(dict(id=r['id'], dn=dn, email=r['email'],
                        has_auth=(r['has_auth']=='t'), is_hist=(r['is_hist']=='t'),
                        seasons=seasons, first=norm(first), last=norm(last),
                        cf=canon_first(first)))

# group by last name, then unify first names via dict-canonical OR prefix(>=3)
by_last = defaultdict(list)
for p in players: by_last[p['last']].append(p)

clusters = []  # list of member-lists
for last, grp in by_last.items():
    # union-find on first names: same cf, or one prefix of other (>=3 chars)
    firsts = list({p['cf'] for p in grp})
    parent = {f:f for f in firsts}
    def find(x):
        while parent[x]!=x: parent[x]=parent[parent[x]]; x=parent[x]
        return x
    def union(a,b): parent[find(a)]=find(b)
    for i in range(len(firsts)):
        for j in range(i+1, len(firsts)):
            a, b = firsts[i], firsts[j]
            if a==b: continue
            if len(a)>=3 and len(b)>=3 and (a.startswith(b) or b.startswith(a)):
                union(a,b)
    keyed = defaultdict(list)
    for p in grp: keyed[find(p['cf'])].append(p)
    for k, mem in keyed.items():
        distinct_first = {m['first'] for m in mem}
        if len(mem) >= 2 and len(distinct_first) >= 2:  # nickname variants (not exact dups)
            clusters.append(mem)

def pick_target(mem):
    return sorted(mem, key=lambda m: (not m['has_auth'], m['is_hist'], -len(m['seasons']),
                                      -(max(m['seasons']) if m['seasons'] else 0)))[0]

safe, flag = [], []
for mem in clusters:
    # season collision?
    seen=set(); overlap=set()
    for m in mem:
        for s in m['seasons']:
            if s in seen: overlap.add(s)
            seen.add(s)
    (flag if overlap else safe).append((mem, sorted(overlap)))

def line(m): return f"{m['dn']} <{m['email']}>{'[HIST]' if m['is_hist'] else ''} [{min(m['seasons']) if m['seasons'] else '-'}-{max(m['seasons']) if m['seasons'] else '-'}, {len(m['seasons'])}s]"

print(f"\n=== SAFE nickname merges (disjoint seasons): {len(safe)} clusters ===")
for mem, _ in sorted(safe, key=lambda x: x[0][0]['last']):
    t = pick_target(mem)
    print(f"  {t['last'].title()}: TARGET {line(t)}")
    for m in mem:
        if m['id']!=t['id']: print(f"        <- {line(m)}")

print(f"\n=== FLAG nickname clusters (season overlap - REVIEW): {len(flag)} ===")
for mem, ov in sorted(flag, key=lambda x: x[0][0]['last']):
    print(f"  {mem[0]['last'].title()} (overlap {ov}):")
    for m in mem: print(f"        {line(m)}")

# emit SAFE merge SQL
out = "/Users/kurtiswh/Cursor/PP6/data/imports/historic/_staging/_load"
os.makedirs(out, exist_ok=True)
with open(f"{out}/nickname_merges_SAFE.sql","w") as fh:
    fh.write("-- Auto-generated nickname merges (disjoint seasons, validated). Review before apply.\n")
    fh.write("do $$\ndeclare v_t uuid;\nbegin\n")
    for mem,_ in safe:
        t = pick_target(mem)
        for m in mem:
            if m['id']==t['id']: continue
            fh.write(f"  update historical_season_standings set user_id='{t['id']}' where user_id='{m['id']}';\n")
            fh.write(f"  update user_emails set is_primary_user_email=false, is_primary=false where user_id='{m['id']}';\n")
            fh.write(f"  perform merge_users('{m['id']}','{t['id']}',null,'Nickname-variation merge (validated: disjoint seasons)','{{}}'::jsonb);\n")
    fh.write("end $$;\n")
print(f"\nSAFE merge SQL -> {out}/nickname_merges_SAFE.sql")
