"""Rebuild the local product seed and source-image crops from the supplied catalog.

Requires pypdfium2 and Pillow. Never modifies either original PDF.
"""
from pathlib import Path
import json
import pypdfium2 as pdfium

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'database'
IMAGES = DATA / 'images'
IMAGES.mkdir(parents=True, exist_ok=True)
source = json.loads((ROOT / 'project-reference/catalog.json').read_text(encoding='utf-8'))
pdf = pdfium.PdfDocument(ROOT / source['source_file'])
no_image = {60, 85, 149, 186, 255, 256, 257, 288}
needs_review = {85, 106, 117, 149, 185, 186, 190, 191, 207, 255, 256, 257, 288}
products = []
for page_number in range(1, len(pdf) + 1):
    page = pdf[page_number - 1]
    text = page.get_textpage()
    groups = {}
    for index in range(text.count_chars()):
        char = text.get_text_range(index, 1)
        left, bottom, right, top = text.get_charbox(index)
        if char.isdigit() and 50 < left < 73:
            key = next((k for k in groups if abs(k - (bottom + top) / 2) < 3), (bottom + top) / 2)
            groups.setdefault(key, []).append((left, char))
    centers = {int(''.join(c for _, c in sorted(chars))): center for center, chars in groups.items()}
    rendered = page.render(scale=3).to_pil()
    page_rows = [r for r in source['products'] if r['source_page'] == page_number]
    row_centers = sorted(centers.values(), reverse=True)
    gap = sorted([a - b for a, b in zip(row_centers, row_centers[1:])])[len(row_centers) // 2 - 1]
    for row in page_rows:
        serial = row['source_serial']
        image_name = None
        if serial not in no_image:
            center = centers[serial]
            top = (page.get_height() - center - gap / 2 + 1) * 3
            bottom = (page.get_height() - center + gap / 2 - 1) * 3
            crop = rendered.crop((75 * 3, round(top), 138 * 3, round(bottom)))
            image_name = f'product-{serial:03}.webp'
            crop.save(IMAGES / image_name, 'WEBP', quality=86)
        notes = list(row['data_notes'])
        if serial == 106:
            notes.append('Packing 2 pcs requires confirmation: source name does not specify a pack of two.')
        if serial in needs_review:
            notes.append('Inactive pending source-data confirmation. Source rate is preserved without correction.')
        products.append({
            'id': f'p-{serial:03}', 'code': f'ZP-{serial:03}',
            'sourceSerial': serial, 'sourcePage': page_number,
            'name': row['name'], 'brand': row['brand'], 'category': row['category'],
            'rate': row['rate'], 'packing': row['packing_raw'] or 'Not supplied',
            'packingCount': row['packing_count'], 'cartonQuantity': row['quantity_packets'],
            'status': 'Inactive' if serial in needs_review else 'Active',
            'image': image_name, 'costPrice': None, 'effectiveDate': '2026-10-20', 'notes': notes,
        })
(DATA / 'products.json').write_text(json.dumps(products, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
(DATA / 'categories.json').write_text(json.dumps(list(dict.fromkeys(p['category'] for p in products)), indent=2) + '\n', encoding='utf-8')
print(f'Created {len(products)} product records and {sum(bool(p["image"]) for p in products)} source image crops.')
