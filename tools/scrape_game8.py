#!/usr/bin/env python3
"""Build data/digimon.json from Game8's Digimon Story: Time Stranger guide.

Reads the "All Digivolutions" chart for the full list of Digimon and
digivolution links, then each Digimon's own page for its details, stats,
skills, resistances, traits and digivolution requirements.

Pages are cached in tools/.cache so reruns don't hit the site again.
Delete that folder to fetch fresh copies.

    pip install beautifulsoup4 lxml
    python3 tools/scrape_game8.py
"""

import json
import re
import sys
import time
import urllib.request
from pathlib import Path

from bs4 import BeautifulSoup

BASE = 'https://game8.co/games/Digimon-Story-Time-Stranger/archives/'
CHART_URL = BASE + '554944'
ROOT = Path(__file__).resolve().parent.parent
CACHE = Path(__file__).resolve().parent / '.cache'
OUT = ROOT / 'data' / 'digimon.json'
DELAY = 1.5  # seconds between requests
USER_AGENT = 'Mozilla/5.0 (compatible; DigiDexTimeStranger/1.0; personal fan app)'

STAT_NAMES = {'max hp': 'HP', 'hp': 'HP', 'max sp': 'SP', 'sp': 'SP', 'atk': 'ATK', 'def': 'DEF',
              'int': 'INT', 'spi': 'SPI', 'spd': 'SPD'}
RESIST_SYMBOLS = {'⭘': 'weak', '○': 'weak', '◯': 'weak', '△': 'resist', '✕': 'null', '×': 'null',
                  '-': 'neutral', '－': 'neutral'}
STAGES = ['In-Training I', 'In-Training II', 'Rookie', 'Champion', 'Ultimate', 'Mega', 'Mega+', 'Armor', 'Hybrid']


def fetch(url):
    """Return a page's HTML, from the cache when we have it."""
    page_id = url.rstrip('/').rsplit('/', 1)[-1]
    path = CACHE / f'{page_id}.html'
    if path.exists():
        return path.read_text(encoding='utf-8')
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
            with urllib.request.urlopen(req, timeout=30) as res:
                html = res.read().decode('utf-8')
            break
        except Exception as err:  # network hiccup: back off and retry
            if attempt == 3:
                raise
            print(f'  retry {url}: {err}', file=sys.stderr)
            time.sleep(2 ** (attempt + 1))
    CACHE.mkdir(exist_ok=True)
    path.write_text(html, encoding='utf-8')
    time.sleep(DELAY)
    return html


def text(el):
    return el.get_text(' ', strip=True) if el else ''


def page_id(href):
    m = re.search(r'/archives/(\d+)', href or '')
    return m.group(1) if m else None


def slugify(name):
    s = re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')
    return s or 'digimon'


def section_tables(wrapper):
    """Map each h3 heading (or h2 when no h3 follows) to the tables under it."""
    out, current = {}, None
    for el in wrapper.find_all(['h2', 'h3', 'table']):
        if el.name in ('h2', 'h3'):
            current = text(el)
            out.setdefault(current, [])
        elif current:
            out[current].append(el)
    return out


def find_section(sections, *needles):
    for title, tables in sections.items():
        t = title.lower()
        if all(n.lower() in t for n in needles) and tables:
            return tables
    return []


def parse_requirements(cell):
    """Turn '・ Agent Rank 3 or higher ・ 1090+ Max HP' into structured requirements."""
    raw = [p.strip() for p in re.split(r'・', text(cell))
           if p.strip() and 'cannot evolve' not in p.lower()]
    req = {'stats': {}, 'raw': raw}
    other = []
    for line in raw:
        m = re.match(r'Agent Rank (\d+)', line, re.I)
        if m:
            req['agentRank'] = int(m.group(1))
            continue
        m = re.match(r'([\d,]+)\+?\s*(Max HP|Max SP|HP|SP|ATK|DEF|INT|SPI|SPD)\b', line, re.I)
        if m:
            req['stats'][STAT_NAMES[m.group(2).lower()]] = int(m.group(1).replace(',', ''))
            continue
        m = re.match(r'(?:Lv\.?|Level)\s*(\d+)', line, re.I)
        if m:
            req['level'] = int(m.group(1))
            continue
        other.append(line)
    if other:
        req['other'] = ' · '.join(other)
    if not req['stats']:
        del req['stats']
    return req


def resist_table(table):
    """Header rows hold names, the following row holds symbols."""
    out = {}
    rows = table.find_all('tr')
    for head, body in zip(rows[0::2], rows[1::2]):
        names = [text(c) for c in head.find_all(['th', 'td'])]
        vals = []
        for c in body.find_all(['th', 'td']):
            img = c.find('img')
            sym = (img.get('alt') if img else text(c)).strip()
            vals.append(RESIST_SYMBOLS.get(sym, sym or 'neutral'))
        for n, v in zip(names, vals):
            if n:
                out[n] = v
    return out


def parse_skills(table, with_level):
    """Skill rows alternate: a data row, then a description row spanning the table."""
    skills, current = [], None
    for row in table.find_all('tr')[1:]:
        cells = row.find_all(['td', 'th'])
        if len(cells) == 1 and current is not None:
            current['description'] = text(cells[0])
            continue
        if len(cells) < 4:
            continue
        vals = [text(c) for c in cells]
        el_img = cells[-3].find('img')
        offset = 1 if with_level else 0
        current = {
            'name': vals[offset],
            'element': (el_img.get('alt') if el_img else vals[offset + 1]) or None,
            'sp': int(vals[offset + 2]) if vals[offset + 2].isdigit() else vals[offset + 2],
            'kind': vals[offset + 3],
        }
        if with_level:
            current['level'] = int(vals[0]) if vals[0].isdigit() else vals[0]
        skills.append(current)
    return skills


def parse_digimon_page(html):
    soup = BeautifulSoup(html, 'lxml')
    wrapper = soup.select_one('.archive-style-wrapper')
    sections = section_tables(wrapper)
    info = {}

    basic = find_section(sections, 'Basic Info')
    if basic:
        rows = basic[0].find_all('tr')
        m = re.search(r'#(\d+)', text(rows[0]))
        if m:
            info['number'] = int(m.group(1))
        cells = rows[1].find_all('td')
        img = cells[0].find('img')
        if img and img.get('data-src'):
            info['image'] = img['data-src']
        info['attribute'] = text(cells[1]) or None
        info['stage'] = text(cells[2]) or None
        if len(rows) > 2:
            cells = rows[-1].find_all('td')
            if len(cells) >= 2:
                info['type'] = text(cells[0]) or None
                info['personality'] = text(cells[1]) or None

    attr_res = find_section(sections, 'Attribute Resist')
    elem_res = find_section(sections, 'Elemental Resist')
    if attr_res or elem_res:
        info['resistances'] = {
            'attribute': resist_table(attr_res[0]) if attr_res else {},
            'element': resist_table(elem_res[0]) if elem_res else {},
        }

    # Requirements to digivolve into this Digimon.
    reqs = find_section(sections, 'Evolution Requirements')
    if reqs:
        for row in reqs[0].find_all('tr')[1:]:
            cells = row.find_all('td')
            if len(cells) >= 2:
                info['requirements'] = parse_requirements(cells[1])
                break

    # Requirements listed per digivolution on this page (used as a fallback).
    info['digivolveTo'] = {}
    evos = find_section(sections, 'Evolutions')
    for title, tables in sections.items():
        if title.lower().endswith(' evolutions') and 'de-digi' not in title.lower():
            evos = tables
    for table in evos[:1]:
        for row in table.find_all('tr')[1:]:
            cells = row.find_all('td')
            link = cells[0].find('a') if cells else None
            if len(cells) >= 2 and link:
                info['digivolveTo'][page_id(link.get('href'))] = parse_requirements(cells[1])

    stats = find_section(sections, 'Level 99 Stats')
    if stats:
        info['stats99'] = {}
        for row in stats[0].find_all('tr')[1:]:
            k, v = text(row.find('th')), text(row.find('td'))
            if k and v.replace(',', '').isdigit():
                info['stats99'][k] = int(v.replace(',', ''))

    special = find_section(sections, 'Special Skills')
    if special:
        info['specialSkills'] = parse_skills(special[0], with_level=False)
    attach = find_section(sections, 'Attachment Skills')
    if attach:
        info['attachmentSkills'] = parse_skills(attach[0], with_level=True)

    traits = []
    for title, tables in sections.items():
        if title.lower().endswith('traits') and 'effective' not in title.lower() and tables:
            for cell in tables[0].find_all('td'):
                t = text(cell)
                if t and t.lower() != 'list of traits':
                    traits.append(t)
    if traits:
        info['traits'] = traits

    return info


def parse_chart(html):
    """Every Digimon on the chart, with the page ids it digivolves to."""
    soup = BeautifulSoup(html, 'lxml')
    table = next(t for t in soup.select('.archive-style-wrapper table')
                 if 'De-Digivolve' in text(t.find('tr')))
    entries = []
    for row in table.find_all('tr')[1:]:
        cells = row.find_all('td')
        if len(cells) < 3:
            continue
        link = cells[1].find('a')
        m = re.search(r'#(\d+)', text(cells[1]))
        entries.append({
            'pid': page_id(link['href']),
            'name': text(link),
            'number': int(m.group(1)) if m else None,
            'to': [page_id(a['href']) for a in cells[2].find_all('a')],
            'from': [page_id(a['href']) for a in cells[0].find_all('a')],
        })
    return entries


def main():
    print('Fetching chart…')
    entries = parse_chart(fetch(CHART_URL))
    print(f'{len(entries)} Digimon on the chart')

    ids, used = {}, set()
    for e in entries:
        slug = slugify(e['name'])
        while slug in used:
            slug += '-2'
        used.add(slug)
        ids[e['pid']] = slug

    digimon, pages = [], {}
    for i, e in enumerate(entries, 1):
        url = BASE + e['pid']
        print(f'[{i}/{len(entries)}] {e["name"]}')
        try:
            pages[e['pid']] = info = parse_digimon_page(fetch(url))
        except Exception as err:
            print(f'  failed to parse {url}: {err}', file=sys.stderr)
            pages[e['pid']] = info = {}
        d = {'id': ids[e['pid']], 'name': e['name'], 'number': e['number']}
        for key in ('stage', 'attribute', 'type', 'personality', 'image', 'stats99', 'resistances',
                    'specialSkills', 'attachmentSkills', 'traits'):
            if info.get(key):
                d[key] = info[key]
        d['source'] = url
        d['verified'] = True
        digimon.append(d)

    evolutions, seen = [], set()
    for e in entries:
        pairs = [(e['pid'], t) for t in e['to']] + [(f, e['pid']) for f in e['from']]
        for src, dst in pairs:
            if src not in ids or dst not in ids or (src, dst) in seen:
                continue
            seen.add((src, dst))
            req = pages.get(dst, {}).get('requirements') or pages.get(src, {}).get('digivolveTo', {}).get(dst) or {}
            req = {k: v for k, v in req.items() if k != 'raw'}
            evolutions.append({'from': ids[src], 'to': ids[dst], 'requirements': req, 'verified': True})

    stages_present = [s for s in STAGES if any(d.get('stage') == s for d in digimon)]
    stages_present += sorted({d['stage'] for d in digimon if d.get('stage') and d['stage'] not in STAGES})
    out = {
        'version': 2,
        'game': 'Digimon Story: Time Stranger',
        'source': CHART_URL,
        'scraped': time.strftime('%Y-%m-%d'),
        'note': 'Scraped from Game8. Requirements apply to digivolving into the target Digimon.',
        'stats': ['HP', 'SP', 'ATK', 'DEF', 'INT', 'SPI', 'SPD'],
        'stages': stages_present,
        'digimon': sorted(digimon, key=lambda d: d.get('number') or 9999),
        'evolutions': evolutions,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
    print(f'Wrote {len(digimon)} Digimon and {len(evolutions)} digivolutions to {OUT}')


if __name__ == '__main__':
    main()
